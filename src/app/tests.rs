use super::*;
#[tokio::test]
async fn link_only_messages_return_unchanged_without_sign_in_or_a_model() {
    let fixture = tempfile::tempdir().unwrap();
    let events = Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
    let received = events.clone();
    let engine = Engine::new(
        fixture.path().to_path_buf(),
        Arc::new(move |_, event| received.lock().unwrap().push(event)),
    )
    .unwrap();
    {
        let mut state = engine.state.lock().await;
        state.conversation = "chat".into();
        state.storage.set_enabled("chat", true).unwrap();
    }
    let text = "https://share.google/ExactPath?q=one%20two#entrance";
    engine.clone().page_json(json!({"type":"translate","request_id":"link","conversation":"chat","message_id":"draft:link","direction":"outgoing","purpose":"reply","text":text}).to_string(), 1).await;
    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|event| event["type"] == "translation" && event["text"] == text)
    );
    assert!(
        !events
            .lock()
            .unwrap()
            .iter()
            .any(|event| event["type"] == "translation_error")
    );
}
#[tokio::test]
async fn thinking_commands_require_current_catalog_model_and_supported_effort() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let engine = Engine::new(dir.clone(), Arc::new(|_, _| {})).unwrap();
    {
        let mut state = engine.state.lock().await;
        state.storage.settings.model = Some("gpt-6.1-sol".into());
        state.models = vec![inference::Model {
            slug: "gpt-6.1-sol".into(),
            display_name: "Sol".into(),
        }];
        state.translation_ready = true;
    }
    assert!(
        engine
            .native_inner(r#"{"type":"reasoning","slug":"gpt-6.1-sol","effort":"none"}"#)
            .await
            .is_err()
    );
    assert!(
        engine
            .native_inner(r#"{"type":"reasoning","slug":"gpt-6-luna","effort":"low"}"#)
            .await
            .is_err()
    );
    engine
        .native_inner(r#"{"type":"reasoning","slug":"gpt-6.1-sol","effort":"low"}"#)
        .await
        .unwrap();
    assert_eq!(
        engine
            .state
            .lock()
            .await
            .storage
            .settings
            .model_reasoning
            .get("gpt-6.1-sol"),
        Some(&crate::model_options::ReasoningEffort::Low)
    );
    assert_eq!(engine.state.lock().await.generation, 1);
    engine
        .native_inner(r#"{"type":"reasoning","slug":"gpt-6.1-sol","effort":null}"#)
        .await
        .unwrap();
    assert!(
        engine
            .state
            .lock()
            .await
            .storage
            .settings
            .model_reasoning
            .is_empty()
    );
    engine.state.lock().await.models_busy = true;
    assert!(
        engine
            .native_inner(r#"{"type":"reasoning","slug":"gpt-6.1-sol","effort":"high"}"#)
            .await
            .is_err()
    );
}
use crate::protocol::{Direction, parse_page};
impl Engine {
    async fn page_json(self: Arc<Self>, payload: String, sequence: u64) {
        self.page(parse_page(&payload).unwrap(), sequence).await;
    }
}
#[tokio::test]
async fn draft_edits_require_current_completed_native_output() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let events = Arc::new(std::sync::Mutex::new(Vec::<(EventTarget, Value)>::new()));
    let received = events.clone();
    let engine = Engine::new(
        dir.clone(),
        Arc::new(move |page, event| received.lock().unwrap().push((page, event))),
    )
    .unwrap();
    let request = TranslationRequest {
        request_id: "ticket".into(),
        conversation: "chat".into(),
        message_id: "draft".into(),
        direction: Direction::Outgoing,
        purpose: TranslationPurpose::Reply,
        text: "Hello".into(),
        context: vec![],
    };
    {
        let mut state = engine.state.lock().await;
        state.conversation = "chat".into();
        state.view_id = "view".into();
        state.storage.set_enabled("chat", true).unwrap();
    }
    let edit = |ticket: &str, view: &str, source: &str, restore| PageRequest::EditDraft {
        edit_id: "edit".into(),
        ticket: ticket.into(),
        conversation: "chat".into(),
        view_id: view.into(),
        source: source.into(),
        restore,
    };
    engine
        .clone()
        .page(edit("ticket", "view", "Hello", false), 1)
        .await;
    assert_eq!(
        events.lock().unwrap().last().unwrap().1["type"],
        "draft_edit_error"
    );
    engine
        .state
        .lock()
        .await
        .remember_reply(&request, "Hola", 0);
    engine
        .clone()
        .page(edit("ticket", "view", "Hello", false), 2)
        .await;
    let (page, event) = events.lock().unwrap().last().unwrap().clone();
    assert_eq!(page, EventTarget::Desktop);
    assert_eq!(event["text"], "Hola");
    engine
        .clone()
        .page(edit("ticket", "view", "Edited Spanish", true), 3)
        .await;
    assert_eq!(events.lock().unwrap().last().unwrap().1["text"], "Hello");
    for invalid in [
        edit("ticket", "view", "New source", false),
        edit("ticket", "other", "Hello", false),
        edit("unknown", "view", "Hello", false),
    ] {
        engine.clone().page(invalid, 4).await;
        assert_eq!(
            events.lock().unwrap().last().unwrap().1["type"],
            "draft_edit_error"
        );
    }
    engine.state.lock().await.generation += 1;
    engine
        .clone()
        .page(edit("ticket", "view", "Hello", false), 5)
        .await;
    assert_eq!(
        events.lock().unwrap().last().unwrap().1["type"],
        "draft_edit_error"
    );
}
#[tokio::test]
async fn chat_state_updates_while_authentication_is_waiting() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let events = Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
    let received = events.clone();
    let engine = Engine::new(
        dir.clone(),
        Arc::new(move |page, event| {
            if page == EventTarget::Desktop {
                received.lock().unwrap().push(event);
            }
        }),
    )
    .unwrap();
    let auth_wait = engine.auth.lock().await;
    tokio::time::timeout(std::time::Duration::from_millis(500), engine.clone().page_json(
        json!({"type":"active_conversation","conversation":"chat","title":"Contact","view_id":"current"}).to_string(), 1
    )).await.expect("Chat updates must not wait for browser consent or token refresh");
    let events = events.lock().unwrap();
    let status = events
        .iter()
        .find(|event| event["type"] == "status")
        .unwrap();
    assert_eq!(status["conversation"], "Contact");
    assert_eq!(status["view_id"], "current");
    assert_eq!(status["signed_in"], false);
    assert!(status.get("credentials").is_none());
    drop(events);
    drop(auth_wait);
}
#[tokio::test]
async fn modern_chats_with_the_same_title_are_independent_and_view_bound() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let engine = Engine::new(dir.clone(), Arc::new(|_, _| {})).unwrap();
    let a = "3EB0A123456789ABCDEF0123456789AB";
    let b = "3EB0B123456789ABCDEF0123456789AB";
    let observe = |view, ids: Vec<&str>| {
        json!({"type":"active_conversation","view_id":view,"conversation":"","title":"Contact","detection":"ready","message_ids":ids}).to_string()
    };
    engine.clone().page_json(observe("first", vec![a]), 1).await;
    let first = engine.state.lock().await.conversation.clone();
    assert!(!first.is_empty());
    engine
        .clone()
        .native(json!({"type":"enable","enabled":true,"view_id":"first"}).to_string())
        .await;
    let generation = engine.state.lock().await.generation;
    assert!(engine.valid_generation(&first, generation).await);
    engine
        .clone()
        .native(
            json!({"type":"rules","view_id":"first","rules":"Use polite language."}).to_string(),
        )
        .await;
    assert!(!engine.valid_generation(&first, generation).await);
    let generation = engine.state.lock().await.generation;
    let older = "3EB0C123456789ABCDEF0123456789AB";
    engine
        .clone()
        .page_json(observe("first", vec![older]), 2)
        .await;
    assert_eq!(engine.state.lock().await.conversation, first);
    assert!(engine.valid_generation(&first, generation).await);
    engine
        .clone()
        .page_json(observe("second", vec![b]), 3)
        .await;
    let second = engine.state.lock().await.conversation.clone();
    assert_ne!(first, second);
    engine
        .clone()
        .native(json!({"type":"rules","view_id":"first","rules":"Wrong chat"}).to_string())
        .await;
    assert!(
        engine
            .state
            .lock()
            .await
            .storage
            .preferences(&second)
            .rules
            .is_empty()
    );
    engine
        .clone()
        .native(json!({"type":"enable","enabled":true,"view_id":"first"}).to_string())
        .await;
    assert!(!engine.state.lock().await.storage.enabled(&second));
    engine.clone().page_json(observe("third", vec![a]), 4).await;
    assert_eq!(engine.state.lock().await.conversation, first);
    assert!(!engine.valid_generation(&first, generation).await);
    assert!(engine.state.lock().await.storage.enabled(&first));
}
#[tokio::test]
async fn disabled_chats_and_stale_generations_fail_closed() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let engine = Engine::new(dir.clone(), Arc::new(|_, _| {})).unwrap();
    engine
        .clone()
        .page_json(
            json!({"type":"active_conversation","conversation":"a","title":"A"}).to_string(),
            1,
        )
        .await;
    let req = TranslationRequest {
        request_id: "r".into(),
        conversation: "a".into(),
        message_id: "m".into(),
        direction: Direction::Incoming,
        purpose: crate::protocol::TranslationPurpose::Reading,
        text: "Hola".into(),
        context: vec![],
    };
    assert!(engine.translate(req).await.is_err());
    engine
        .clone()
        .native(json!({"type":"enable","enabled":true}).to_string())
        .await;
    let generation = engine.state.lock().await.generation;
    assert!(engine.valid_generation("a", generation).await);
    engine
        .clone()
        .native(json!({"type":"enable","enabled":false}).to_string())
        .await;
    assert!(!engine.valid_generation("a", generation).await);
    engine
        .clone()
        .page_json(
            json!({"type":"active_conversation","conversation":"b","title":"B"}).to_string(),
            3,
        )
        .await;
    assert!(!engine.valid_generation("a", generation).await);
    engine
        .clone()
        .page_json(
            json!({"type":"active_conversation","conversation":"a","title":"A"}).to_string(),
            2,
        )
        .await;
    assert_eq!(engine.state.lock().await.conversation, "b");
}
#[tokio::test]
async fn cancellation_and_sent_message_preferences_invalidate_work_without_blocking_replies() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let events = Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
    let received = events.clone();
    let engine = Engine::new(
        dir.clone(),
        Arc::new(move |_, event| received.lock().unwrap().push(event)),
    )
    .unwrap();
    let mut request = TranslationRequest {
        request_id: "draft".into(),
        conversation: "chat".into(),
        message_id: "m".into(),
        direction: Direction::Outgoing,
        purpose: TranslationPurpose::Reading,
        text: "Hola".into(),
        context: vec![],
    };
    let generation = {
        let mut state = engine.state.lock().await;
        state.conversation = "chat".into();
        state.storage.set_enabled("chat", true).unwrap();
        state.requests.insert(request.request_id.clone());
        state.generation
    };
    assert!(engine.valid_request(&request, generation).await);
    engine
        .state
        .lock()
        .await
        .storage
        .settings
        .view_preferences
        .include_sent = false;
    assert!(!engine.valid_request(&request, generation).await);
    request.purpose = TranslationPurpose::Reply;
    assert!(engine.valid_request(&request, generation).await);
    let reading = engine.reading_permits.acquire().await.unwrap();
    assert!(engine.reply_permits.try_acquire().is_ok());
    drop(reading);
    engine
        .clone()
        .page(
            PageRequest::CancelTranslation {
                request_id: "draft".into(),
                conversation: "other".into(),
            },
            1,
        )
        .await;
    assert!(engine.valid_request(&request, generation).await);
    engine
        .clone()
        .page(
            PageRequest::CancelTranslation {
                request_id: "draft".into(),
                conversation: "chat".into(),
            },
            2,
        )
        .await;
    assert!(!engine.valid_request(&request, generation).await);
    let count = events.lock().unwrap().len();
    // Cancel can reach a different Tokio worker before Translate is registered.
    engine
        .clone()
        .page(PageRequest::Translate(request), 3)
        .await;
    assert_eq!(events.lock().unwrap().len(), count);
    assert!(engine.state.lock().await.requests.is_empty());
}
#[tokio::test]
async fn saved_history_is_local_and_view_bound_even_during_authentication() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let events = Arc::new(std::sync::Mutex::new(Vec::<(EventTarget, Value)>::new()));
    let received = events.clone();
    let engine = Engine::new(
        dir.clone(),
        Arc::new(move |page, event| received.lock().unwrap().push((page, event))),
    )
    .unwrap();
    {
        let mut state = engine.state.lock().await;
        state.conversation = "chat".into();
        state.view_id = "view".into();
        state.storage.set_enabled("chat", true).unwrap();
        let key = translation::history_key(
            "chat",
            "message",
            Direction::Incoming,
            "Hola",
            &state.storage.settings.translation_preferences,
        );
        state
            .storage
            .save_message(key, "chat", "Hello".into())
            .unwrap();
    }
    let auth_wait = engine.auth.lock().await;
    let probe = |view: &str| PageRequest::SavedMessages {
        request_id: "r".into(),
        conversation: "chat".into(),
        view_id: view.into(),
        messages: vec![crate::protocol::MessageProbe {
            message_id: "message".into(),
            direction: Direction::Incoming,
            text: "Hola".into(),
        }],
    };
    tokio::time::timeout(
        std::time::Duration::from_millis(500),
        engine.clone().page(probe("view"), 1),
    )
    .await
    .unwrap();
    assert_eq!(
        events.lock().unwrap().last().unwrap().1["items"][0]["text"],
        "Hello"
    );
    let count = events.lock().unwrap().len();
    engine.clone().page(probe("stale"), 2).await;
    assert_eq!(events.lock().unwrap().len(), count);
    engine
        .state
        .lock()
        .await
        .storage
        .set_enabled("chat", false)
        .unwrap();
    engine.clone().page(probe("view"), 3).await;
    assert_eq!(events.lock().unwrap().len(), count);
    let state = engine.state.lock().await;
    assert!(!state.translation_ready);
    assert!(state.recent_reading.is_empty());
    drop(state);
    drop(auth_wait);
}
