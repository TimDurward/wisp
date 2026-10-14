use super::*;
#[test]
fn reasoning_choices_persist_per_model_and_default_can_be_restored() {
    use crate::model_options::ReasoningEffort;
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let mut storage = Storage::open(dir.clone()).unwrap();
    storage
        .set_reasoning("gpt-6.1-sol".into(), Some(ReasoningEffort::Low))
        .unwrap();
    storage
        .set_reasoning("gpt-6-luna".into(), Some(ReasoningEffort::None))
        .unwrap();
    let mut storage = Storage::open(dir.clone()).unwrap();
    assert_eq!(
        storage.settings.model_reasoning.get("gpt-6.1-sol"),
        Some(&ReasoningEffort::Low)
    );
    assert_eq!(
        storage.settings.model_reasoning.get("gpt-6-luna"),
        Some(&ReasoningEffort::None)
    );
    storage.set_reasoning("gpt-6.1-sol".into(), None).unwrap();
    let storage = Storage::open(dir.clone()).unwrap();
    assert!(!storage.settings.model_reasoning.contains_key("gpt-6.1-sol"));
    assert!(storage.settings.model_reasoning.contains_key("gpt-6-luna"));
}
#[test]
fn rules_persist_per_chat_and_legacy_opt_ins_migrate() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("settings.json"),
        serde_json::to_vec(&serde_json::json!({"host_id":"host","enabled":{hash("a"):true}}))
            .unwrap(),
    )
    .unwrap();
    let mut storage = Storage::open(dir.clone()).unwrap();
    assert!(storage.enabled("a"));
    storage
        .set_rules("a", "Use usted.\nKeep names unchanged.")
        .unwrap();
    assert!(storage.preferences("b").rules.is_empty());
    let mut storage = Storage::open(dir.clone()).unwrap();
    assert!(storage.enabled("a"));
    assert_eq!(
        storage.preferences("a").rules,
        "Use usted.\nKeep names unchanged."
    );
    storage.set_rules("a", "").unwrap();
    assert!(storage.enabled("a"));
    assert!(storage.preferences("a").rules.is_empty());
}
#[test]
fn opaque_message_records_preserve_chat_identity_and_opt_in() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let a = "3EB0A123456789ABCDEF0123456789AB".to_owned();
    let b = "3EB0B123456789ABCDEF0123456789AB".to_owned();
    let c = "3EB0C123456789ABCDEF0123456789AB".to_owned();
    let mut storage = Storage::open(dir.clone()).unwrap();
    let first = storage
        .identify_chat("", &[a.clone(), b.clone()], None)
        .unwrap();
    assert!(first.starts_with("chat:"));
    storage.set_enabled(&first, true).unwrap();
    let other = storage
        .identify_chat("", std::slice::from_ref(&c), None)
        .unwrap();
    assert_ne!(first, other);
    assert!(!storage.enabled(&other));
    assert!(storage.identify_chat("", &[a.clone(), c], None).is_err());
    let mut storage = Storage::open(dir.clone()).unwrap();
    assert_eq!(
        storage
            .identify_chat("", std::slice::from_ref(&b), None)
            .unwrap(),
        first
    );
    assert!(storage.enabled(&first));
    // Recognize the same record when WhatsApp exposes the legacy wrapper again.
    assert_eq!(
        storage
            .identify_chat("123@lid", &[format!("false_123@lid_{a}")], None)
            .unwrap(),
        first
    );
    let saved = fs::read_to_string(dir.join("settings.json")).unwrap();
    assert!(!saved.contains(&a));
    assert!(!saved.contains(&b));
}
#[test]
fn settings_cache_and_host_survive_restart() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let mut s = Storage::open(dir.clone()).unwrap();
    let host = s.settings.host_id.clone();
    assert!(s.settings.view_preferences.include_sent);
    assert!(s.settings.view_preferences.live_preview);
    assert!(s.settings.view_preferences.enter_prepares);
    assert!(s.settings.view_preferences.original_on_hover);
    s.set_view_preferences(ViewPreferences {
        reading_view: crate::preferences::ReadingView::BothLanguages,
        include_sent: false,
        live_preview: false,
        enter_prepares: false,
        focus_chat: true,
        original_on_hover: false,
    })
    .unwrap();
    assert!(!s.enabled("chat"));
    s.set_enabled("chat", true).unwrap();
    s.cache("key".into(), "Hello".into()).unwrap();
    let mut s = Storage::open(dir.clone()).unwrap();
    assert_eq!(s.settings.host_id, host);
    assert!(!s.settings.view_preferences.include_sent);
    assert!(!s.settings.view_preferences.live_preview);
    assert!(!s.settings.view_preferences.enter_prepares);
    assert!(s.settings.view_preferences.focus_chat);
    assert!(!s.settings.view_preferences.original_on_hover);
    assert!(
        s.settings.view_preferences.reading_view == crate::preferences::ReadingView::BothLanguages
    );
    assert!(s.enabled("chat"));
    assert_eq!(s.cached("key").as_deref(), Some("Hello"));
    s.clear_cache().unwrap();
    assert!(s.cached("key").is_none());
}
#[test]
fn durable_history_survives_restart_and_clear_is_scoped_to_a_chat() {
    let fixture = tempfile::tempdir().unwrap();
    let dir = fixture.path().to_path_buf();
    let mut storage = Storage::open(dir.clone()).unwrap();
    storage.set_enabled("a", true).unwrap();
    storage.set_rules("a", "Use tú.").unwrap();
    let preferences = TranslationPreferences {
        reply_language: crate::preferences::Language::French,
        global_rules: "Keep it casual.".into(),
        ..Default::default()
    };
    storage
        .set_translation_preferences(preferences.clone())
        .unwrap();
    storage
        .save_message("a-key".into(), "a", "Hello".into())
        .unwrap();
    storage
        .save_message("b-key".into(), "b", "Tomorrow".into())
        .unwrap();
    storage
        .cache_for_chat("a-draft".into(), "Salut".into(), "a")
        .unwrap();
    storage
        .cache_for_chat("b-draft".into(), "Demain".into(), "b")
        .unwrap();
    let mut storage = Storage::open(dir.clone()).unwrap();
    assert_eq!(storage.settings.translation_preferences, preferences);
    assert_eq!(
        storage.saved_message("a-key", "a").as_deref(),
        Some("Hello")
    );
    assert!(storage.saved_message("a-key", "b").is_none());
    assert_eq!(storage.chat_cache_count("a"), 2);
    storage.clear_chat_cache("a").unwrap();
    assert!(storage.saved_message("a-key", "a").is_none());
    assert!(storage.cached("a-draft").is_none());
    assert_eq!(
        storage.saved_message("b-key", "b").as_deref(),
        Some("Tomorrow")
    );
    assert!(storage.cached("b-draft").is_some());
    assert!(storage.enabled("a"));
    assert_eq!(storage.preferences("a").rules, "Use tú.");
    assert_eq!(storage.preferences("a").cache_epoch, 1);
    assert_eq!(storage.settings.history_revision, 1);
    storage.clear_cache().unwrap();
    let storage = Storage::open(dir.clone()).unwrap();
    assert_eq!(storage.saved_count(), 0);
    assert_eq!(storage.cache_count(), 0);
    assert_eq!(storage.settings.history_revision, 2);
}
