use super::*;
use crate::{
    protocol::Direction,
    translation::{body, cache_key},
};
use serde_json::json;
#[test]
fn sse_handles_every_utf8_boundary_and_crlf() {
    let data = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"¡Qué tal!\"}\r\n\r\n"
        .as_bytes();
    for split in 0..=data.len() {
        let mut parser = Sse::default();
        let mut events = parser.push(&data[..split]).unwrap();
        events.extend(parser.push(&data[split..]).unwrap());
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["delta"], "¡Qué tal!");
    }
}
#[test]
fn partial_translation_is_never_successful() {
    let mut s = TranslationStream::default();
    s.event(&json!({"type":"response.output_text.delta","delta":"Hello"}))
        .unwrap();
    assert!(s.finish().is_err());
    let mut s = TranslationStream::default();
    assert!(s.event(&json!({"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}})).is_err());
}
#[test]
fn mixed_sse_line_endings_keep_event_order() {
    let data = b"data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\r\n\r\ndata: {\"type\":\"response.completed\"}\n\n";
    for split in 0..=data.len() {
        let mut parser = Sse::default();
        let mut events = parser.push(&data[..split]).unwrap();
        events.extend(parser.push(&data[split..]).unwrap());
        assert_eq!(events.len(), 2);
        let mut stream = TranslationStream::default();
        for event in events {
            stream.event(&event).unwrap();
        }
        assert_eq!(stream.finish().unwrap(), "Hello");
    }
}
#[test]
fn request_uses_subscription_supported_fields() {
    let r = TranslationRequest {
        request_id: "r".into(),
        message_id: "m".into(),
        conversation: "c".into(),
        text: "Hola".into(),
        direction: Direction::Incoming,
        purpose: crate::protocol::TranslationPurpose::Reading,
        context: vec![],
    };
    let request_body = body(
        "discovered-model",
        &r,
        "",
        &crate::preferences::TranslationPreferences::default(),
    );
    let automatic = Options::new("gpt-6.1-sol".into(), None);
    let low = Options::new("gpt-6.1-sol".into(), Some(ReasoningEffort::Low));
    assert!(
        automatic
            .body(
                &r,
                "",
                &crate::preferences::TranslationPreferences::default()
            )
            .get("reasoning")
            .is_none()
    );
    assert_eq!(
        low.body(
            &r,
            "",
            &crate::preferences::TranslationPreferences::default()
        )["reasoning"]["effort"],
        "low"
    );
    assert_eq!(automatic.cache_model(), "gpt-6.1-sol");
    assert_ne!(automatic.cache_model(), low.cache_model());
    assert!(
        Options::new("gpt-6.1-sol".into(), Some(ReasoningEffort::None))
            .reasoning
            .is_none()
    );
    assert!(
        Options::new("unknown-model".into(), Some(ReasoningEffort::High))
            .reasoning
            .is_none()
    );
    assert_eq!(request_body["store"], false);
    assert_eq!(request_body["stream"], true);
    assert!(request_body["input"].is_array());
    assert!(request_body.get("temperature").is_none());
    let mut changed = r.clone();
    changed.context.push(crate::protocol::ContextLine {
        direction: Direction::Outgoing,
        text: "Hi".into(),
    });
    assert_ne!(
        cache_key(
            "a",
            "m",
            &r,
            "",
            &crate::preferences::TranslationPreferences::default(),
            0
        ),
        cache_key(
            "a",
            "m",
            &changed,
            "",
            &crate::preferences::TranslationPreferences::default(),
            0
        )
    );
    assert_ne!(
        cache_key(
            "a",
            "m",
            &r,
            "",
            &crate::preferences::TranslationPreferences::default(),
            0
        ),
        cache_key(
            "b",
            "m",
            &r,
            "",
            &crate::preferences::TranslationPreferences::default(),
            0
        )
    );
    assert_ne!(
        cache_key(
            "a",
            "m",
            &r,
            "",
            &crate::preferences::TranslationPreferences::default(),
            0
        ),
        cache_key(
            "a",
            "m",
            &r,
            "Use usted.",
            &crate::preferences::TranslationPreferences::default(),
            0
        )
    );
    assert!(
        body(
            "discovered-model",
            &r,
            "Use usted.",
            &crate::preferences::TranslationPreferences::default()
        )["instructions"]
            .as_str()
            .unwrap()
            .contains("Use usted.")
    );
}
