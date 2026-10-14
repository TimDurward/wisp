use crate::app::{Engine, EventTarget};
use crate::protocol::PageRequest;
use cxx_qt::{CxxQtType, Threading};
use cxx_qt_lib::QString;
use std::{path::PathBuf, pin::Pin, sync::Arc};

#[cxx_qt::bridge(namespace = "wisp")]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        #[namespace = ""]
        type QString = cxx_qt_lib::QString;
        include!("wisp/AppShell.h");
        #[cxx_name = "runApp"]
        fn run_app(
            smoke: bool,
            diagnostics: bool,
            screenshot: QString,
            data_dir: QString,
            icon_export: QString,
            capture_panel: QString,
        ) -> i32;
    }
    extern "RustQt" {
        #[qobject]
        type WispBridge = super::WispBridgeRust;
        #[qinvokable]
        fn initialize(self: Pin<&mut WispBridge>, path: QString);
        #[qinvokable]
        #[cxx_name = "pageRequest"]
        fn page_request(self: Pin<&mut WispBridge>, payload: QString);
        #[qinvokable]
        #[cxx_name = "nativeCommand"]
        fn native_command(self: Pin<&mut WispBridge>, payload: QString);
        #[qsignal]
        #[cxx_name = "pageEvent"]
        fn page_event(self: Pin<&mut WispBridge>, payload: QString);
        #[qsignal]
        #[cxx_name = "nativeEvent"]
        fn native_event(self: Pin<&mut WispBridge>, payload: QString);
    }
    impl cxx_qt::Threading for WispBridge {}
}

pub struct WispBridgeRust {
    runtime: Option<tokio::runtime::Runtime>,
    engine: Option<Arc<Engine>>,
    pending: Arc<tokio::sync::Semaphore>,
    page_sequence: u64,
    pending_view: Option<(PageRequest, u64)>,
}

impl Default for WispBridgeRust {
    fn default() -> Self {
        Self {
            runtime: None,
            engine: None,
            pending: Arc::new(tokio::sync::Semaphore::new(32)),
            page_sequence: 0,
            pending_view: None,
        }
    }
}

impl Drop for WispBridgeRust {
    fn drop(&mut self) {
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_background();
        }
    }
}

impl ffi::WispBridge {
    pub fn initialize(mut self: Pin<&mut Self>, path: QString) {
        if self.rust().runtime.is_some() {
            return;
        }
        let thread = self.qt_thread();
        let emit = Arc::new(move |page: EventTarget, value: serde_json::Value| {
            let payload = value.to_string();
            let _ = thread.queue(move |mut object| {
                let payload = QString::from(&payload);
                if page == EventTarget::Page {
                    object.as_mut().page_event(payload);
                } else {
                    object.as_mut().native_event(payload);
                }
            });
        });
        let runtime = match tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(error) => {
                self.as_mut().native_event(QString::from(
                    &serde_json::json!({"type":"error","message":error.to_string()}).to_string(),
                ));
                return;
            }
        };
        // Keychain can request OS authorization. Keep that work off the Qt thread.
        let root = PathBuf::from(path.to_string());
        let setup = runtime.spawn_blocking(move || Engine::new(root, emit));
        let ready_thread = self.qt_thread();
        runtime.spawn(async move {
            let result = setup
                .await
                .map_err(anyhow::Error::from)
                .and_then(|result| result);
            let _ = ready_thread.queue(move |mut object| match result {
                Ok(engine) => {
                    object.as_mut().rust_mut().engine = Some(engine.clone());
                    let pending = object.as_mut().rust_mut().pending_view.take();
                    if let Some(runtime) = &object.rust().runtime {
                        runtime.spawn(async move {
                            if let Some((request, sequence)) = pending {
                                engine.clone().page(request, sequence).await;
                            }
                            engine.startup().await;
                        });
                    }
                }
                Err(error) => {
                    let message = error.to_string();
                    object.as_mut().native_event(QString::from(
                        &serde_json::json!({"type":"error","message":message}).to_string(),
                    ));
                }
            });
        });
        self.as_mut().rust_mut().runtime = Some(runtime);
    }
    pub fn page_request(mut self: Pin<&mut Self>, payload: QString) {
        let payload = payload.to_string();
        let Ok(request) = crate::protocol::parse_page(&payload) else {
            return;
        };
        let Ok(permit) = self.rust().pending.clone().try_acquire_owned() else {
            return;
        };
        self.as_mut().rust_mut().page_sequence += 1;
        let sequence = self.rust().page_sequence;
        if self.rust().engine.is_none() {
            if matches!(request, PageRequest::ActiveConversation { .. }) {
                self.as_mut().rust_mut().pending_view = Some((request, sequence));
            }
            return;
        }
        if let (Some(runtime), Some(engine)) = (&self.rust().runtime, &self.rust().engine) {
            let engine = engine.clone();
            runtime.spawn(async move {
                engine.page(request, sequence).await;
                drop(permit);
            });
        }
    }
    pub fn native_command(self: Pin<&mut Self>, payload: QString) {
        if let (Some(runtime), Some(engine)) = (&self.rust().runtime, &self.rust().engine) {
            runtime.spawn(engine.clone().native(payload.to_string()));
        }
    }
}
