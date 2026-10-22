mod accounts;
mod commands;
mod page;
#[cfg(test)]
mod tests;
mod translate;
mod voice;

use crate::{
    auth::Auth,
    inference::{self, Model},
    preferences::{Language, MAX_RULES_CHARS, SpanishVariant},
    protocol::{
        ConversationDetection, Direction, NativeCommand, PageRequest, TranslationPurpose,
        TranslationRequest, parse_native,
    },
    storage::{Storage, now},
    translation,
};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    collections::{HashSet, VecDeque},
    path::PathBuf,
    sync::Arc,
};
use tokio::sync::{Mutex, Semaphore};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventTarget {
    Desktop,
    Page,
}

pub type Emit = Arc<dyn Fn(EventTarget, Value) + Send + Sync>;

struct AccountStatus {
    signed_in: bool,
    eligible: bool,
    client_id: Option<String>,
}

impl From<&Auth> for AccountStatus {
    fn from(auth: &Auth) -> Self {
        Self {
            signed_in: auth.signed_in(),
            eligible: auth.eligible(),
            client_id: auth
                .account
                .as_ref()
                .map(|account| account.client_id.clone()),
        }
    }
}

struct State {
    storage: Storage,
    conversation: String,
    title: String,
    peer: String,
    can_repair_chat: bool,
    detection: ConversationDetection,
    view_id: String,
    message_ids: Vec<String>,
    generation: u64,
    active_sequence: u64,
    models: Vec<Model>,
    models_busy: bool,
    translation_ready: bool,
    account_status: AccountStatus,
    requests: HashSet<String>,
    cancelled: VecDeque<String>,
    recent_reading: VecDeque<u64>,
    recent_replies: VecDeque<u64>,
    completed_replies: VecDeque<CompletedReply>,
    voice_transfer: Option<(
        crate::speech::AudioTransfer,
        Vec<crate::protocol::ContextLine>,
    )>,
}

struct CompletedReply {
    ticket: String,
    conversation: String,
    view_id: String,
    generation: u64,
    source: String,
    text: String,
    saved_at: u64,
}

impl State {
    fn current(&self, conversation: &str, generation: u64) -> bool {
        self.generation == generation
            && self.conversation == conversation
            && self.storage.enabled(conversation)
    }
    fn valid_request(&self, request: &TranslationRequest, generation: u64) -> bool {
        self.current(&request.conversation, generation)
            && self.requests.contains(&request.request_id)
            && (request.purpose != TranslationPurpose::Voice || self.storage.settings.voice_enabled)
            && (request.purpose == TranslationPurpose::Reply
                || request.direction != Direction::Outgoing
                || self.storage.settings.view_preferences.include_sent)
    }
    fn remember_reply(&mut self, request: &TranslationRequest, text: &str, generation: u64) {
        if request.purpose != TranslationPurpose::Reply {
            return;
        }
        self.completed_replies
            .retain(|reply| now().saturating_sub(reply.saved_at) < 1800);
        self.completed_replies.push_back(CompletedReply {
            ticket: request.request_id.clone(),
            conversation: request.conversation.clone(),
            view_id: self.view_id.clone(),
            generation,
            source: request.text.clone(),
            text: text.to_owned(),
            saved_at: now(),
        });
        while self.completed_replies.len() > 16 {
            self.completed_replies.pop_front();
        }
    }
}

pub struct Engine {
    state: Mutex<State>,
    auth: Mutex<Auth>,
    account_operations: Mutex<()>,
    client: reqwest::Client,
    reading_permits: Semaphore,
    reply_permits: Semaphore,
    emit: Emit,
    speech: crate::speech::SpeechModel,
    voice_permits: Arc<Semaphore>,
}

impl Engine {
    pub fn new(root: PathBuf, emit: Emit) -> Result<Arc<Self>> {
        let speech = crate::speech::SpeechModel::new(&root);
        let storage = Storage::open(root.clone())?;
        let account = storage
            .settings
            .accounts
            .iter()
            .find(|a| Some(&a.client_id) == storage.settings.active_account.as_ref())
            .cloned();
        let mut auth = Auth::new(account, storage.settings.host_id.clone(), &root)?;
        if auth.restore().is_err() {
            emit(
                EventTarget::Desktop,
                json!({"type":"error","message":"Could not restore ChatGPT access. Reconnect in Settings."}),
            );
        }
        Ok(Arc::new(Self {
            state: Mutex::new(State {
                storage,
                conversation: String::new(),
                title: String::new(),
                peer: String::new(),
                can_repair_chat: false,
                detection: ConversationDetection::NoChat,
                view_id: String::new(),
                message_ids: vec![],
                generation: 0,
                active_sequence: 0,
                models: vec![],
                models_busy: false,
                translation_ready: false,
                account_status: AccountStatus::from(&auth),
                requests: HashSet::new(),
                cancelled: VecDeque::new(),
                recent_reading: VecDeque::new(),
                recent_replies: VecDeque::new(),
                completed_replies: VecDeque::new(),
                voice_transfer: None,
            }),
            auth: Mutex::new(auth),
            account_operations: Mutex::new(()),
            client: crate::auth::http_client()?,
            reading_permits: Semaphore::new(1),
            reply_permits: Semaphore::new(1),
            emit,
            speech,
            voice_permits: Arc::new(Semaphore::new(1)),
        }))
    }
    fn emit_desktop(&self, value: Value) {
        (self.emit)(EventTarget::Desktop, value);
    }
    fn emit_page(&self, value: Value) {
        (self.emit)(EventTarget::Page, value);
    }
    pub fn error(&self, error: impl std::fmt::Display) {
        self.emit_desktop(json!({"type":"error","message":error.to_string()}));
    }
    pub async fn status(&self) {
        // OAuth/token refresh can wait on a browser or the network. Present the
        // last account facts while busy, without delaying chat/view updates.
        // Lock order remains auth then state; credentials never enter the snapshot.
        let auth = self.auth.try_lock().ok();
        let mut state = self.state.lock().await;
        if let Some(auth) = auth {
            state.account_status = AccountStatus::from(&*auth);
        }
        if !state.account_status.eligible && state.translation_ready {
            state.translation_ready = false;
            state.generation += 1;
        }
        let model_options = state.storage.settings.model.as_ref().map(|slug| {
            inference::Options::new(
                slug.clone(),
                state.storage.settings.model_reasoning.get(slug).copied(),
            )
        });
        let reasoning_options = state
            .storage
            .settings
            .model
            .as_deref()
            .map(crate::model_options::reasoning_options)
            .unwrap_or_default();
        let preferences = &state.storage.settings.translation_preferences;
        let languages: Vec<Value> = Language::all().into_iter()
            .chain(state.storage.settings.custom_languages.iter().cloned().map(Language::Custom))
            .map(|language| json!({"id": language.id(), "label": language.label(), "value": language,
                "code":language.code(), "voice_supported":language.code().is_some_and(crate::languages::speech_supported)}))
            .collect();
        self.emit_desktop(json!({
            "type": "status", "initialized": true,
            "credentials_available": crate::platform::credentials::available(),
            "models_busy": state.models_busy, "translation_ready": state.translation_ready,
            "rules": state.storage.preferences(&state.conversation).rules,
            "max_rules_chars": MAX_RULES_CHARS,
            "signed_in": state.account_status.signed_in,
            "eligible": state.account_status.eligible,
            "account": state.account_status.client_id,
            "accounts": state.storage.settings.accounts,
            "model": state.storage.settings.model, "models": state.models,
            "reasoning_options": reasoning_options,
            "reasoning_effort": model_options.and_then(|options| options.reasoning),
            "cache_count": state.storage.cache_count(),
            "saved_count": state.storage.saved_count(),
            "chat_cache_count": state.storage.chat_cache_count(&state.conversation),
            "translation_preferences": {
                "reading_language": preferences.reading_language.id(),
                "reply_language": preferences.reply_language.id(),
                "spanish_variant": preferences.spanish_variant,
                "global_rules": preferences.global_rules
            },
            "languages": languages,
            "speech": self.speech.status(),
            "voice_enabled": state.storage.settings.voice_enabled,
            "voice_auto": state.storage.settings.voice_auto.unwrap_or(true),
            "voice_max_minutes": state.storage.settings.voice_max_minutes.unwrap_or(10),
            "voice_languages": Self::voice_languages(),
            "transcript_count": state.storage.transcript_count(),
            "spanish_variants": SpanishVariant::ALL.map(|id|json!({"id":id,"label":id.label()})),
            "conversation": if state.conversation.is_empty() { "" } else { &state.title },
            "conversation_id": state.conversation, "view_id": state.view_id,
            "can_repair_chat": state.can_repair_chat,
            "repair_title": if state.can_repair_chat { &state.title } else { "" },
            "active_sequence": state.active_sequence,
            "revision": state.generation,
            "chat_detection": state.detection,
            "enabled": state.storage.enabled(&state.conversation),
            "view_preferences": state.storage.settings.view_preferences
        }));
    }
    async fn config(&self) {
        let state = self.state.lock().await;
        self.emit_page(
            json!({
                "type": "config", "conversation": state.conversation,
                "view_id": state.view_id, "revision": state.generation,
                "view_preferences": state.storage.settings.view_preferences,
                "can_translate": state.translation_ready,
                "speech": self.speech.status(),
                "voice_enabled": state.storage.settings.voice_enabled,
                "voice_auto": state.storage.settings.voice_auto.unwrap_or(true),
                "voice_max_minutes": state.storage.settings.voice_max_minutes.unwrap_or(10),
                "voice_languages": Self::voice_languages(),
                "history_revision": state.storage.settings.history_revision,
                "reading_label": state.storage.settings.translation_preferences.target_label(&state.storage.settings.translation_preferences.reading_language),
                "reply_label": state.storage.settings.translation_preferences.target_label(&state.storage.settings.translation_preferences.reply_language),
                "reading_language": state.storage.settings.translation_preferences.reading_language.id(),
                "reply_language": state.storage.settings.translation_preferences.reply_language.id(),
                "has_rules": !state.storage.preferences(&state.conversation).rules.is_empty() || !state.storage.settings.translation_preferences.global_rules.is_empty(),
                "enabled": !state.conversation.is_empty()
                    && state.storage.enabled(&state.conversation)
            }),
        );
    }
}
