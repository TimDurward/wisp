use super::MODEL_SHA;
use anyhow::{Context, Result, ensure};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

pub const MODEL_BYTES: u64 = 487_601_967;
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";

#[derive(Clone, Serialize)]
pub struct ModelStatus {
    pub ready: bool,
    pub downloading: bool,
    pub progress: u8,
    pub error: String,
    pub label: &'static str,
    pub download_bytes: u64,
}
pub struct SpeechModel {
    path: PathBuf,
    status: Mutex<ModelStatus>,
    download: tokio::sync::Mutex<()>,
    cancelled: AtomicBool,
}
impl SpeechModel {
    pub fn new(root: &Path) -> Self {
        let path = root.join("speech/ggml-small.bin");
        let ready = path
            .metadata()
            .is_ok_and(|meta| meta.is_file() && meta.len() == MODEL_BYTES);
        Self {
            path,
            status: Mutex::new(ModelStatus {
                ready,
                downloading: false,
                progress: 0,
                error: String::new(),
                label: "Whisper small · Multilingual",
                download_bytes: MODEL_BYTES,
            }),
            download: tokio::sync::Mutex::new(()),
            cancelled: AtomicBool::new(false),
        }
    }
    pub fn path(&self) -> PathBuf {
        self.path.clone()
    }
    pub fn status(&self) -> ModelStatus {
        self.status.lock().unwrap().clone()
    }
    pub fn cancel_download(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }
    pub async fn download(&self, changed: impl Fn(ModelStatus)) -> Result<()> {
        let _guard = self
            .download
            .try_lock()
            .context("Speech model download is already in progress")?;
        self.cancelled.store(false, Ordering::Relaxed);
        {
            let mut status = self.status.lock().unwrap();
            status.downloading = true;
            status.error.clear();
            status.progress = 0;
        }
        changed(self.status());
        let result = self.download_inner(&changed).await;
        {
            let mut status = self.status.lock().unwrap();
            status.downloading = false;
            status.ready = result.is_ok();
            status.error = result
                .as_ref()
                .err()
                .map(ToString::to_string)
                .unwrap_or_default();
        }
        changed(self.status());
        result
    }
    async fn download_inner(&self, changed: &impl Fn(ModelStatus)) -> Result<()> {
        let directory = self.path.parent().unwrap();
        std::fs::create_dir_all(directory)?;
        let mut temporary = tempfile::NamedTempFile::new_in(directory)?;
        // A separate public-download client never carries ChatGPT credentials.
        let client = reqwest::Client::builder()
            .https_only(true)
            .connect_timeout(std::time::Duration::from_secs(30))
            .timeout(std::time::Duration::from_secs(1800))
            .build()?;
        let response = client.get(MODEL_URL).send();
        tokio::pin!(response);
        let response = loop {
            tokio::select! {
                response = &mut response => break response?.error_for_status()?,
                _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                    ensure!(!self.cancelled.load(Ordering::Relaxed), "Speech model download cancelled");
                }
            }
        };
        ensure!(
            response.content_length().is_none_or(|n| n == MODEL_BYTES),
            "Unexpected speech model size"
        );
        let mut stream = response.bytes_stream();
        let mut hash = Sha256::new();
        let mut downloaded = 0u64;
        let mut reported = 0;
        loop {
            let chunk = tokio::select! {
                chunk = stream.next() => chunk,
                _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                    ensure!(!self.cancelled.load(Ordering::Relaxed), "Speech model download cancelled");
                    continue;
                }
            };
            let Some(chunk) = chunk else {
                break;
            };
            ensure!(
                !self.cancelled.load(Ordering::Relaxed),
                "Speech model download cancelled"
            );
            let chunk = chunk?;
            downloaded += chunk.len() as u64;
            ensure!(
                downloaded <= MODEL_BYTES,
                "Speech model download exceeded its expected size"
            );
            temporary.write_all(&chunk)?;
            hash.update(&chunk);
            let progress = (downloaded * 100 / MODEL_BYTES) as u8;
            if progress != reported {
                reported = progress;
                self.status.lock().unwrap().progress = progress;
                changed(self.status());
            }
        }
        ensure!(
            downloaded == MODEL_BYTES && format!("{:x}", hash.finalize()) == MODEL_SHA,
            "Speech model verification failed. Retry the download"
        );
        temporary.as_file().sync_all()?;
        temporary.persist(&self.path).map_err(|e| e.error)?;
        Ok(())
    }
}
pub fn verify(path: &Path) -> Result<()> {
    let mut file = std::fs::File::open(path)
        .context("Download the speech model in Languages settings first")?;
    ensure!(
        file.metadata()?.len() == MODEL_BYTES,
        "Speech model is incomplete. Download it again"
    );
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65_536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    ensure!(
        format!("{:x}", digest.finalize()) == MODEL_SHA,
        "Speech model is damaged. Download it again"
    );
    Ok(())
}
