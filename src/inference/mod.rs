use crate::model_options::{ReasoningEffort, reasoning_options};
use crate::{protocol::TranslationRequest, translation};
use anyhow::{Context, Result, bail, ensure};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Serialize, Deserialize)]
pub struct Model {
    pub slug: String,
    pub display_name: String,
}

pub struct Options {
    pub model: String,
    pub reasoning: Option<ReasoningEffort>,
}
impl Options {
    pub fn new(model: String, reasoning: Option<ReasoningEffort>) -> Self {
        let reasoning = reasoning.filter(|effort| reasoning_options(&model).contains(effort));
        Self { model, reasoning }
    }
    pub fn cache_model(&self) -> String {
        self.reasoning
            .map(|effort| {
                format!(
                    "{}|reasoning:{}",
                    self.model,
                    serde_json::to_string(&effort).unwrap()
                )
            })
            .unwrap_or_else(|| self.model.clone())
    }
    fn body(
        &self,
        request: &TranslationRequest,
        rules: &str,
        preferences: &crate::preferences::TranslationPreferences,
    ) -> Value {
        let mut body = translation::body(&self.model, request, rules, preferences);
        if let Some(effort) = self.reasoning {
            body["reasoning"] = serde_json::json!({"effort":effort});
        }
        body
    }
}

pub async fn models(client: &reqwest::Client, token: &str) -> Result<Vec<Model>> {
    let response = client
        .get("https://api.openai.com/v1/models")
        .bearer_auth(token)
        .send()
        .await?;
    ensure!(
        response.status().is_success(),
        "ChatGPT model discovery returned HTTP {}. Your account may not be eligible",
        response.status().as_u16()
    );
    let value: Value = response.json().await?;
    let models = value["models"]
        .as_array()
        .context("OpenAI returned an unexpected subscription model catalog")?;
    let result: Vec<_> = models
        .iter()
        .filter(|m| m["visibility"] == "list")
        .filter_map(|m| {
            Some(Model {
                slug: m["slug"].as_str()?.to_owned(),
                display_name: m["display_name"].as_str()?.to_owned(),
            })
        })
        .collect();
    ensure!(
        !result.is_empty(),
        "No eligible translation models are available for this ChatGPT account"
    );
    Ok(result)
}

// Parses bytes, rather than chunk strings: UTF-8 characters and SSE delimiters may split anywhere.
#[derive(Default)]
pub struct Sse {
    pending: Vec<u8>,
}
impl Sse {
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Value>> {
        self.pending.extend_from_slice(bytes);
        ensure!(
            self.pending.len() <= 1_048_576,
            "OpenAI stream event exceeded the size limit"
        );
        let mut events = Vec::new();
        loop {
            let lf = self
                .pending
                .windows(2)
                .position(|w| w == b"\n\n")
                .map(|i| (i, 2));
            let crlf = self
                .pending
                .windows(4)
                .position(|w| w == b"\r\n\r\n")
                .map(|i| (i, 4));
            let boundary = [lf, crlf]
                .into_iter()
                .flatten()
                .min_by_key(|(index, _)| *index);
            let Some((index, size)) = boundary else {
                break;
            };
            let raw: Vec<_> = self.pending.drain(..index + size).collect();
            let text = std::str::from_utf8(&raw)?;
            let data = text
                .lines()
                .filter_map(|line| {
                    line.strip_prefix("data:")
                        .map(|s| s.strip_prefix(' ').unwrap_or(s))
                })
                .collect::<Vec<_>>()
                .join("\n");
            if !data.is_empty() && data != "[DONE]" {
                events.push(serde_json::from_str(&data).context("Malformed OpenAI stream event")?);
            }
        }
        Ok(events)
    }
}

fn event_error(value: &Value) -> String {
    let code = value
        .pointer("/response/error/code")
        .or_else(|| value.pointer("/error/code"))
        .or_else(|| value.get("code"))
        .and_then(Value::as_str)
        .unwrap_or("stream_error");
    match code {
        "subscription_sharing_usage_limit_exceeded" | "subscription_sharing_usage_unavailable" => {
            "ChatGPT usage limit reached. Manage usage in ChatGPT settings".into()
        }
        "subscription_sharing_user_not_eligible" => {
            "This ChatGPT account or workspace is not eligible for plan usage".into()
        }
        "invalid_api_key" | "invalid_token" => {
            "ChatGPT authorization expired or was revoked. Sign in again".into()
        }
        _ => format!(
            "OpenAI could not complete translation ({})",
            code.chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
                .take(80)
                .collect::<String>()
        ),
    }
}

#[derive(Default)]
struct TranslationStream {
    text: String,
    completed: bool,
}
impl TranslationStream {
    fn event(&mut self, value: &Value) -> Result<bool> {
        match value["type"].as_str().unwrap_or_default() {
            "response.output_text.delta" => {
                self.text.push_str(
                    value["delta"]
                        .as_str()
                        .context("Missing translation delta")?,
                );
                ensure!(
                    self.text.len() <= 24_000,
                    "Translation exceeded the size limit"
                );
                Ok(true)
            }
            "response.failed" | "error" => bail!("{}", event_error(value)),
            "response.incomplete" => bail!("Translation was incomplete. Try again"),
            "response.refusal.delta" | "response.refusal.done" => {
                bail!("OpenAI declined to translate this message")
            }
            "response.completed" => {
                self.completed = true;
                Ok(false)
            }
            _ => Ok(false),
        }
    }
    fn finish(self) -> Result<String> {
        ensure!(
            self.completed,
            "Translation stream ended before completion. Try again"
        );
        ensure!(
            !self.text.trim().is_empty(),
            "OpenAI returned an empty translation"
        );
        Ok(self.text)
    }
}

pub async fn translate(
    client: &reqwest::Client,
    token: &str,
    options: &Options,
    request: &TranslationRequest,
    rules: &str,
    preferences: &crate::preferences::TranslationPreferences,
    mut on_delta: impl FnMut(&str),
) -> Result<String> {
    let protected = translation::links::ProtectedLinks::new(&request.text);
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(token)
        .json(&options.body(request, rules, preferences))
        .send()
        .await
        .context("Cannot connect to OpenAI for translation")?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let value: Value = response.json().await.unwrap_or_default();
        bail!("{} (HTTP {status})", event_error(&value));
    }
    let mut chunks = response.bytes_stream();
    let mut parser = Sse::default();
    let mut stream = TranslationStream::default();
    while let Some(chunk) = chunks.next().await {
        for value in parser.push(&chunk?)? {
            if stream.event(&value)? {
                on_delta(&protected.progress(&stream.text));
            }
            if stream.completed {
                return protected.finish(&stream.finish()?);
            }
        }
    }
    protected.finish(&stream.finish()?)
}

#[cfg(test)]
mod tests;
