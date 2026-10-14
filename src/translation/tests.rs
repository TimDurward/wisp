use super::*;
#[test]
fn reading_sent_messages_and_preparing_replies_have_distinct_languages_and_cache_entries() {
    let mut request = TranslationRequest {
        request_id: "r".into(),
        conversation: "c".into(),
        message_id: "m".into(),
        direction: Direction::Outgoing,
        purpose: TranslationPurpose::Reading,
        text: "Hasta mañana".into(),
        context: vec![],
    };
    let instructions = body(
        "available",
        &request,
        "",
        &TranslationPreferences::default(),
    )["instructions"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(instructions.contains("into natural English"));
    let reading_key = cache_key(
        "account",
        "available",
        &request,
        "",
        &TranslationPreferences::default(),
        0,
    );
    request.purpose = TranslationPurpose::Reply;
    let instructions = body(
        "available",
        &request,
        "",
        &TranslationPreferences::default(),
    )["instructions"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(instructions.contains("into natural Peruvian Spanish"));
    assert_ne!(
        reading_key,
        cache_key(
            "account",
            "available",
            &request,
            "",
            &TranslationPreferences::default(),
            0
        )
    );
    let previous_key = hash(
        &serde_json::to_string(&json!([
            "wisp-prompt-v2",
            "",
            "account",
            "available",
            "c",
            "outgoing",
            "Hasta mañana",
            []
        ]))
        .unwrap(),
    );
    assert_eq!(
        cache_key(
            "account",
            "available",
            &request,
            "",
            &TranslationPreferences::default(),
            0
        ),
        previous_key
    );
}
#[test]
fn saved_history_ignores_style_changes_but_tracks_source_and_output_language() {
    let mut preferences = TranslationPreferences::default();
    let key = history_key(
        "chat",
        "false_123@lid_3EB0ABCDEF0123456789",
        Direction::Incoming,
        "Hola",
        &preferences,
    );
    assert_eq!(
        key,
        history_key(
            "chat",
            "3EB0ABCDEF0123456789",
            Direction::Incoming,
            "Hola",
            &preferences
        )
    );
    preferences.global_rules = "Casual, omit opening ¿ and ¡.".into();
    preferences.reply_language = Language::French;
    preferences.spanish_variant = SpanishVariant::Mexico;
    assert_eq!(
        key,
        history_key(
            "chat",
            "3EB0ABCDEF0123456789",
            Direction::Incoming,
            "Hola",
            &preferences
        )
    );
    assert_ne!(
        key,
        history_key(
            "chat",
            "3EB0ABCDEF0123456789",
            Direction::Incoming,
            "Adiós",
            &preferences
        )
    );
    assert_ne!(
        key,
        history_key(
            "other",
            "3EB0ABCDEF0123456789",
            Direction::Incoming,
            "Hola",
            &preferences
        )
    );
    preferences.reading_language = Language::Spanish;
    let mexico = history_key(
        "chat",
        "3EB0ABCDEF0123456789",
        Direction::Incoming,
        "Hola",
        &preferences,
    );
    assert_ne!(key, mexico);
    preferences.spanish_variant = SpanishVariant::Spain;
    assert_ne!(
        mexico,
        history_key(
            "chat",
            "3EB0ABCDEF0123456789",
            Direction::Incoming,
            "Hola",
            &preferences
        )
    );
}
#[test]
fn global_rules_and_chat_priority_follow_configured_languages() {
    let request = TranslationRequest {
        request_id: "r".into(),
        conversation: "c".into(),
        message_id: "m".into(),
        direction: Direction::Outgoing,
        purpose: TranslationPurpose::Reply,
        text: "Hello".into(),
        context: vec![],
    };
    let mut preferences = TranslationPreferences {
        spanish_variant: SpanishVariant::Mexico,
        global_rules: "Use casual wording. Omit opening ¿ and ¡.".into(),
        ..Default::default()
    };
    let instructions = body(
        "available",
        &request,
        "Use usted with this contact.",
        &preferences,
    )["instructions"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(instructions.contains("Spanish as used in Mexico"));
    assert!(instructions.contains(&preferences.global_rules));
    assert!(instructions.contains("Use usted with this contact."));
    assert!(instructions.contains("Chat preferences take precedence"));
    let draft_key = cache_key("a", "model", &request, "", &preferences, 0);
    preferences.reply_language = Language::French;
    assert!(
        body("available", &request, "", &preferences)["instructions"]
            .as_str()
            .unwrap()
            .contains("into natural French")
    );
    assert_ne!(
        draft_key,
        cache_key("a", "model", &request, "", &preferences, 0)
    );
    assert_ne!(
        draft_key,
        cache_key(
            "a",
            "model",
            &request,
            "",
            &TranslationPreferences::default(),
            1
        )
    );
}
