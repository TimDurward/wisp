mod callback;
#[cfg(test)]
mod tests;
mod verification;

use crate::platform::credentials::{delete_credentials, load_credentials, save_credentials};
use crate::storage::{Account, now};
use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use callback::{callback_client_id, listen_for_callback};
use ring::{
    rand::{SecureRandom, SystemRandom},
    signature,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, time::Duration};
use subtle::ConstantTimeEq;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};
use verification::validate_id_token;

const ISSUER: &str = "https://auth.openai.com";
const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE: &str = "https://api.openai.com/v1";
const SCOPE: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
// Credentials deliberately have no Debug implementation and never cross the Qt bridge.
#[derive(Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: String,
    pub scopes: Vec<String>,
    pub expires_at: u64,
}

impl Credentials {
    pub fn eligible(&self) -> bool {
        self.scopes.iter().any(|s| s == "chatgpt.tokens.use.direct")
            && self.scopes.iter().any(|s| s == "resource.invoke")
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    token_type: String,
    expires_in: u64,
}

pub fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .build()?)
}

fn random_secret() -> Result<String> {
    let mut bytes = [0u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| anyhow::anyhow!("Cannot generate OAuth randomness"))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub fn secure_equal(a: &str, b: &str) -> bool {
    bool::from(a.as_bytes().ct_eq(b.as_bytes()))
}

pub struct Auth {
    pub account: Option<Account>,
    credentials: Option<Credentials>,
    host: String,
    client: reqwest::Client,
}

impl Auth {
    pub fn new(account: Option<Account>, host: String) -> Result<Self> {
        Ok(Self {
            account,
            credentials: None,
            host,
            client: http_client()?,
        })
    }
    pub fn restore(&mut self) -> Result<()> {
        self.credentials = self
            .account
            .as_ref()
            .map(|account| load_credentials(account, &self.host))
            .transpose()?
            .flatten();
        Ok(())
    }
    pub fn eligible(&self) -> bool {
        self.credentials.as_ref().is_some_and(Credentials::eligible)
    }
    pub fn signed_in(&self) -> bool {
        self.credentials.is_some()
    }

    pub async fn sign_in(
        &mut self,
        new_account: bool,
        open_browser: impl FnOnce(String),
    ) -> Result<Account> {
        let selected = if new_account {
            None
        } else {
            self.account.clone()
        };
        let state = random_secret()?;
        let nonce = random_secret()?;
        let verifier = random_secret()?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let redirect = format!("http://{address}/auth/callback");
        let mut url = reqwest::Url::parse(AUTHORIZE)?;
        {
            let mut params = url.query_pairs_mut();
            params
                .append_pair(
                    "client_id",
                    selected
                        .as_ref()
                        .map(|a| a.client_id.as_str())
                        .unwrap_or("dynamic_agent_client"),
                )
                .append_pair("ext_agent_host_id", &self.host)
                .append_pair("response_type", "code")
                .append_pair("redirect_uri", &redirect)
                .append_pair("scope", SCOPE)
                .append_pair("resource", RESOURCE)
                .append_pair("state", &state)
                .append_pair("nonce", &nonce)
                .append_pair("code_challenge_method", "S256")
                .append_pair("code_challenge", &challenge);
            if let Some(account) = &selected {
                if let Some(credentials) = &self.credentials {
                    params.append_pair("id_token_hint", &credentials.id_token);
                }
                if !account.email.is_empty() {
                    params.append_pair("login_hint", &account.email);
                }
            } else {
                params.append_pair("agent_name_hint", "Wisp");
            }
        }
        open_browser(url.into());
        let callback = timeout(
            Duration::from_secs(180),
            listen_for_callback(&listener, &state, &address.to_string()),
        )
        .await
        .context("ChatGPT sign-in timed out; try again")??;
        if callback.contains_key("error") {
            bail!("ChatGPT sign-in was declined; you can try again in settings");
        }
        let client_id = callback_client_id(
            selected.as_ref().map(|a| a.client_id.as_str()),
            callback.get("client_id").map(String::as_str),
        )?;
        let code = callback
            .get("code")
            .filter(|v| !v.is_empty())
            .context("OAuth callback has no authorization code")?;
        let tokens = exchange(
            &self.client,
            &[
                ("grant_type", "authorization_code"),
                ("client_id", &client_id),
                ("code", code),
                ("code_verifier", &verifier),
                ("redirect_uri", &redirect),
                ("resource", RESOURCE),
            ],
        )
        .await?;
        let id_token = tokens
            .id_token
            .as_deref()
            .context("OpenAI did not return an ID token")?;
        let claims = validate_id_token(&self.client, id_token, &client_id, Some(&nonce)).await?;
        let subject = claims["sub"]
            .as_str()
            .filter(|s| !s.is_empty())
            .context("ID token has no subject")?
            .to_owned();
        if let Some(old) = &selected {
            ensure!(
                secure_equal(&old.subject, &subject),
                "The selected ChatGPT account changed; add it as a separate account"
            );
        }
        let account = Account {
            client_id,
            subject,
            email: claims["email"]
                .as_str()
                .unwrap_or("ChatGPT account")
                .to_owned(),
        };
        let credentials = Credentials {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            id_token: id_token.to_owned(),
            scopes: tokens
                .scope
                .unwrap_or_default()
                .split_whitespace()
                .map(str::to_owned)
                .collect(),
            expires_at: now() + tokens.expires_in,
        };
        save_credentials(&account, &self.host, &credentials)?;
        self.account = Some(account.clone());
        self.credentials = Some(credentials);
        Ok(account)
    }

    pub async fn access_token(&mut self) -> Result<String> {
        let current = self
            .credentials
            .as_ref()
            .context("Continue with ChatGPT to enable translation")?;
        ensure!(
            current.eligible(),
            "ChatGPT plan permission is disabled. Continue with ChatGPT and allow plan usage"
        );
        if current.expires_at > now() + 60 {
            return Ok(current.access_token.clone());
        }
        let refresh = current
            .refresh_token
            .clone()
            .context("Sign in again to renew ChatGPT access")?;
        let account = self
            .account
            .clone()
            .context("No selected ChatGPT account")?;
        // Called under a single Tokio mutex: rotating refresh credentials never race.
        let tokens = exchange(
            &self.client,
            &[
                ("grant_type", "refresh_token"),
                ("client_id", &account.client_id),
                ("refresh_token", &refresh),
                ("resource", RESOURCE),
            ],
        )
        .await?;
        let current = self.credentials.as_ref().unwrap();
        let id_token = if let Some(id) = tokens.id_token {
            let claims = validate_id_token(&self.client, &id, &account.client_id, None).await?;
            ensure!(
                claims["sub"].as_str() == Some(account.subject.as_str()),
                "ChatGPT account changed during refresh"
            );
            id
        } else {
            current.id_token.clone()
        };
        let credentials = Credentials {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token.or(Some(refresh)),
            id_token,
            scopes: tokens
                .scope
                .map(|s| s.split_whitespace().map(str::to_owned).collect())
                .unwrap_or_else(|| current.scopes.clone()),
            expires_at: now() + tokens.expires_in,
        };
        let saved = save_credentials(&account, &self.host, &credentials);
        let eligible = credentials.eligible();
        let result = credentials.access_token.clone();
        self.credentials = Some(credentials);
        saved?;
        ensure!(
            eligible,
            "ChatGPT plan permission was revoked. Sign in again"
        );
        Ok(result)
    }

    pub fn switch(&mut self, account: Account) -> Result<()> {
        let credentials = load_credentials(&account, &self.host)?;
        self.account = Some(account);
        self.credentials = credentials;
        Ok(())
    }

    pub async fn sign_out(&mut self) -> Result<bool> {
        let mut revoked = true;
        if let (Some(account), Some(credentials)) = (&self.account, &self.credentials) {
            if let Some(token) = &credentials.refresh_token {
                let attempt = async {
                    let discovery: Value = self
                        .client
                        .get(format!("{ISSUER}/.well-known/openid-configuration"))
                        .send()
                        .await?
                        .error_for_status()?
                        .json()
                        .await?;
                    let endpoint = discovery["revocation_endpoint"]
                        .as_str()
                        .context("No revocation endpoint")?;
                    let url = reqwest::Url::parse(endpoint)?;
                    ensure!(
                        url.scheme() == "https"
                            && url.host_str() == Some("auth.openai.com")
                            && url.port().is_none()
                            && url.username().is_empty(),
                        "Invalid revocation endpoint"
                    );
                    ensure!(
                        self.client
                            .post(url)
                            .form(&[
                                ("token", token.as_str()),
                                ("token_type_hint", "refresh_token"),
                                ("client_id", &account.client_id)
                            ])
                            .send()
                            .await?
                            .status()
                            == reqwest::StatusCode::OK,
                        "Revocation failed"
                    );
                    Ok::<_, anyhow::Error>(())
                };
                revoked = attempt.await.is_ok();
            }
            delete_credentials(account, &self.host)?;
        }
        self.credentials = None;
        Ok(revoked)
    }
}

async fn exchange(client: &reqwest::Client, form: &[(&str, &str)]) -> Result<TokenResponse> {
    let response = client
        .post(TOKEN)
        .form(form)
        .send()
        .await
        .context("Cannot connect to OpenAI authentication")?;
    if !response.status().is_success() {
        // Never include token endpoint response bodies in diagnostics.
        bail!(
            "OpenAI authentication returned HTTP {}. Sign in again to renew access",
            response.status().as_u16()
        );
    }
    let tokens: TokenResponse = response
        .json()
        .await
        .context("Invalid OpenAI token response")?;
    ensure!(
        tokens.token_type.eq_ignore_ascii_case("Bearer")
            && !tokens.access_token.is_empty()
            && tokens.expires_in > 0,
        "Invalid OAuth credentials"
    );
    Ok(tokens)
}
