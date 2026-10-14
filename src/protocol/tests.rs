use super::*;
#[test]
fn native_commands_are_closed_and_rules_stay_native() {
    assert!(parse_native(r#"{"type":"enable","enabled":"yes"}"#).is_err());
    assert!(parse_native(r#"{"type":"sign_in","token":"x"}"#).is_err());
    let rules = r#"{"type":"rules","view_id":"view","rules":"  Use usted.  "}"#;
    assert!(
        matches!(parse_native(rules).unwrap(), NativeCommand::Rules { rules, .. } if rules == "Use usted.")
    );
    assert!(parse_page(rules).is_err());
    assert!(parse_page(r#"{"type":"translate","request_id":"r","conversation":"c","message_id":"m","direction":"incoming","text":"Hola","rules":"Override"}"#).is_err());
}
#[test]
fn bridge_rejects_privileged_commands_and_extras() {
    assert!(parse_page(r#"{"type":"sign_in"}"#).is_err());
    assert!(
        parse_page(r#"{"type":"active_conversation","conversation":"a","title":"a","token":"x"}"#)
            .is_err()
    );
    assert!(
        parse_page(
            r#"{"type":"active_conversation","conversation":"a","title":"a","detection":"execute"}"#
        )
        .is_err()
    );
}
#[test]
fn bridge_bounds_untrusted_text() {
    let req = TranslationRequest {
        request_id: "1".into(),
        conversation: "a".into(),
        message_id: "m".into(),
        direction: Direction::Incoming,
        purpose: crate::protocol::TranslationPurpose::Reading,
        text: "x".repeat(MAX_TEXT + 1),
        context: vec![],
    };
    assert!(req.validate().is_err());
    let records = serde_json::json!({"type":"active_conversation","conversation":"","title":"Contact","view_id":"view","message_ids":vec!["record";65]});
    assert!(parse_page(&records.to_string()).is_err());
}
#[test]
fn view_preferences_are_native_only_and_reply_purpose_is_outgoing_only() {
    let preferences = r#"{"type":"view_preferences","preferences":{"reading_view":"both_languages","include_sent":false}}"#;
    assert!(parse_native(preferences).is_ok());
    assert!(parse_page(preferences).is_err());
    assert!(
        parse_native(r#"{"type":"view_preferences","preferences":{"send_automatically":true}}"#)
            .is_err()
    );
    let mut request = TranslationRequest {
        request_id: "r".into(),
        conversation: "c".into(),
        message_id: "m".into(),
        direction: Direction::Incoming,
        purpose: TranslationPurpose::Reply,
        text: "Hello".into(),
        context: vec![],
    };
    assert!(request.validate().is_err());
    request.direction = Direction::Outgoing;
    assert!(request.validate().is_ok());
}
#[test]
fn draft_edits_cannot_supply_replacement_text_or_unbounded_sources() {
    let mut edit = serde_json::json!({"type":"edit_draft","edit_id":"e","ticket":"t","conversation":"c","view_id":"v","source":"Hello"});
    assert!(parse_page(&edit.to_string()).is_ok());
    edit["text"] = "Arbitrary native input".into();
    assert!(parse_page(&edit.to_string()).is_err());
    edit.as_object_mut().unwrap().remove("text");
    edit["source"] = "x".repeat(24_001).into();
    assert!(parse_page(&edit.to_string()).is_err());
}
#[test]
fn global_defaults_and_history_clearing_are_native_only_and_bounded() {
    let mut defaults = serde_json::json!({"type":"translation_preferences","preferences":{"reply_language":"spanish","spanish_variant":"neutral","global_rules":"  Casual 😊.  "}});
    assert!(
        matches!(parse_native(&defaults.to_string()).unwrap(), NativeCommand::TranslationPreferences { preferences } if preferences.global_rules == "Casual 😊.")
    );
    assert!(parse_page(&defaults.to_string()).is_err());
    defaults["preferences"]["reply_language"] = "unknown".into();
    assert!(parse_native(&defaults.to_string()).is_err());
    defaults["preferences"]["reply_language"] = "french".into();
    defaults["preferences"]["global_rules"] = "😊".repeat(2001).into();
    assert!(parse_native(&defaults.to_string()).is_err());
    let clear = r#"{"type":"clear_chat_cache","view_id":"view"}"#;
    assert!(parse_native(clear).is_ok());
    assert!(parse_page(clear).is_err());
    let mut probe = serde_json::json!({"type":"saved_messages","request_id":"r","conversation":"c","view_id":"v","messages":[{"message_id":"m","direction":"incoming","text":"Hola"}]});
    assert!(parse_page(&probe.to_string()).is_ok());
    probe["messages"][0]["rules"] = "Override".into();
    assert!(parse_page(&probe.to_string()).is_err());
    probe["messages"] = serde_json::json!(vec![
        serde_json::json!({"message_id":"m","direction":"incoming","text":"Hola"});
        65
    ]);
    assert!(parse_page(&probe.to_string()).is_err());
}
