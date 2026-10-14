use super::callback::{callback_client_id, parse_callback};
use super::verification::{validate_claims, verify_jwt};
use super::*;
use serde_json::json;
#[test]
fn registration_rejects_wrong_or_missing_client() {
    assert!(callback_client_id(None, None).is_err());
    assert!(callback_client_id(None, Some("dynamic_agent_client")).is_err());
    assert!(callback_client_id(Some("registered"), Some("other")).is_err());
    assert_eq!(
        callback_client_id(Some("registered"), None).unwrap(),
        "registered"
    );
}
#[test]
fn callback_checks_state_path_host_and_duplicates() {
    let good = b"GET /auth/callback?state=secret&code=abc HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n";
    assert!(parse_callback(good, "secret", "127.0.0.1:1234").is_ok());
    assert!(parse_callback(good, "wrong", "127.0.0.1:1234").is_err());
    assert!(parse_callback(good, "secret", "localhost:1234").is_err());
    assert!(parse_callback(b"GET /auth/callback?state=secret&state=secret HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n", "secret", "127.0.0.1:1234").is_err());
}
#[test]
fn callback_rejects_duplicate_hosts_and_incomplete_requests() {
    let duplicate =
        b"GET /auth/callback?state=s HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nHost: other\r\n\r\n";
    assert!(parse_callback(duplicate, "s", "127.0.0.1:1234").is_err());
    assert!(
        parse_callback(
            b"GET /auth/callback?state=s HTTP/1.1\r\n",
            "s",
            "127.0.0.1:1234"
        )
        .is_err()
    );
}
#[test]
fn id_token_claims_are_bound_to_attempt() {
    let claims = json!({"iss":ISSUER,"aud":"app","exp":now()+120,"iat":now(),"sub":"person","nonce":"nonce"});
    assert!(validate_claims(&claims, "app", Some("nonce")).is_ok());
    assert!(validate_claims(&claims, "other", Some("nonce")).is_err());
    assert!(validate_claims(&claims, "app", Some("other")).is_err());
    let mut expired = claims.clone();
    expired["exp"] = json!(now() - 1);
    assert!(validate_claims(&expired, "app", Some("nonce")).is_err());
}
#[test]
fn unsigned_id_tokens_are_rejected() {
    let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none"}"#);
    assert!(verify_jwt(&format!("{header}.e30."), "app", None, &json!({"keys":[]})).is_err());
}
