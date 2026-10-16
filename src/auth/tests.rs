use super::callback::{callback_client_id, parse_callback};
use super::verification::{validate_claims, verify_jwt};
use super::*;
use serde_json::json;

async fn decline_sign_in(auth: &mut Auth, new_account: bool) -> (Result<Account>, reqwest::Url) {
    let (send_url, receive_url) = tokio::sync::oneshot::channel();
    let sign_in = auth.sign_in(new_account, |url| {
        let _ = send_url.send(url);
    });
    let browser = async {
        let Ok(url) = receive_url.await else {
            return None;
        };
        let url = reqwest::Url::parse(&url).unwrap();
        let params: HashMap<_, _> = url.query_pairs().into_owned().collect();
        let redirect = reqwest::Url::parse(&params["redirect_uri"]).unwrap();
        let address = format!("127.0.0.1:{}", redirect.port().unwrap());
        let mut stream = tokio::net::TcpStream::connect(&address).await.unwrap();
        let request = format!(
            "GET /auth/callback?state={}&error=access_denied HTTP/1.1\r\nHost: {address}\r\n\r\n",
            params["state"]
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        Some(url)
    };
    let (result, url) = tokio::join!(sign_in, browser);
    let url = url.unwrap_or_else(|| {
        panic!(
            "Sign-in failed before opening the browser: {}",
            result.as_ref().err().unwrap()
        )
    });
    (result, url)
}

#[tokio::test]
async fn another_account_omits_saved_identity_and_keeps_current_account_on_decline() {
    let root = tempfile::tempdir().unwrap();
    let mut auth = Auth::new(
        Some(Account {
            client_id: "registered".into(),
            subject: "saved-person".into(),
            email: "saved@example.com".into(),
        }),
        "urn:uuid:test-host".into(),
        root.path(),
    )
    .unwrap();
    auth.credentials = Some(Credentials {
        access_token: "saved-access".into(),
        refresh_token: Some("saved-refresh".into()),
        id_token: "saved-id".into(),
        scopes: SCOPE.split_whitespace().map(str::to_owned).collect(),
        expires_at: now() + 120,
    });
    let (result, url) = decline_sign_in(&mut auth, true).await;
    assert!(result.err().unwrap().to_string().contains("declined"));
    let params: HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(params["client_id"], "dynamic_agent_client");
    assert_eq!(params["agent_name_hint"], "Wisp");
    assert_eq!(params["ext_agent_host_id"], "urn:uuid:test-host");
    assert!(!params.contains_key("id_token_hint"));
    assert!(!params.contains_key("login_hint"));
    assert!(!url.as_str().contains("saved-"));
    assert_eq!(auth.account.as_ref().unwrap().client_id, "registered");
    assert_eq!(
        auth.credentials.as_ref().unwrap().access_token,
        "saved-access"
    );

    let (result, returning) = decline_sign_in(&mut auth, false).await;
    assert!(result.is_err());
    let returning: HashMap<_, _> = returning.query_pairs().into_owned().collect();
    assert_eq!(returning["client_id"], "registered");
    assert_eq!(returning["id_token_hint"], "saved-id");
    assert_eq!(returning["login_hint"], "saved@example.com");
    assert_ne!(returning["state"], params["state"]);
    assert_ne!(returning["nonce"], params["nonce"]);
    assert_ne!(returning["code_challenge"], params["code_challenge"]);
}

#[tokio::test]
async fn another_account_uses_new_registration_after_local_sign_out() {
    let root = tempfile::tempdir().unwrap();
    let mut auth = Auth::new(
        Some(Account {
            client_id: "registered".into(),
            subject: "saved-person".into(),
            email: "saved@example.com".into(),
        }),
        "urn:uuid:test-host".into(),
        root.path(),
    )
    .unwrap();
    let (result, url) = decline_sign_in(&mut auth, true).await;
    assert!(result.is_err());
    let params: HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(params["client_id"], "dynamic_agent_client");
    assert!(!params.contains_key("id_token_hint"));
    assert!(!params.contains_key("login_hint"));
    assert_eq!(auth.account.as_ref().unwrap().client_id, "registered");
    assert!(!auth.signed_in());
}

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
