use crate::preferences::{
    CustomLanguage, TranslationPreferences, ViewPreferences, normalize_rules,
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

pub const MAX_TEXT: usize = 8_000;
pub const MAX_PAYLOAD: usize = 64_000;
pub const MAX_NATIVE_PAYLOAD: usize = 32_000;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Incoming,
    Outgoing,
}

#[derive(Clone, Copy, Default, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TranslationPurpose {
    #[default]
    Reading,
    Reply,
    Voice,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ContextLine {
    pub direction: Direction,
    pub text: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TranslationRequest {
    pub request_id: String,
    pub conversation: String,
    pub message_id: String,
    pub direction: Direction,
    pub text: String,
    #[serde(default)]
    pub purpose: TranslationPurpose,
    #[serde(default)]
    pub context: Vec<ContextLine>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MessageProbe {
    pub message_id: String,
    pub direction: Direction,
    pub text: String,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VoiceRequest {
    pub request_id: String,
    pub conversation: String,
    pub view_id: String,
    pub message_id: String,
    pub direction: Direction,
    pub language: Option<String>,
    #[serde(default)]
    pub retranscribe: bool,
    #[serde(default)]
    pub context: Vec<ContextLine>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum PageRequest {
    Appearance {
        dark: bool,
    },
    ActiveConversation {
        conversation: String,
        title: String,
        #[serde(default)]
        detection: ConversationDetection,
        #[serde(default)]
        view_id: String,
        #[serde(default)]
        message_ids: Vec<String>,
    },
    Translate(TranslationRequest),
    VoiceBegin(VoiceRequest),
    SavedVoice(VoiceRequest),
    VoiceAudio {
        request_id: String,
        conversation: String,
        view_id: String,
        index: u32,
        pcm: String,
    },
    VoiceFinish {
        request_id: String,
        conversation: String,
        view_id: String,
    },
    VoiceCancel {
        request_id: String,
        conversation: String,
        view_id: String,
    },
    SpeechDownload {
        conversation: String,
        view_id: String,
    },
    SavedMessages {
        request_id: String,
        conversation: String,
        view_id: String,
        messages: Vec<MessageProbe>,
    },
    CancelTranslation {
        request_id: String,
        conversation: String,
    },
    EditDraft {
        edit_id: String,
        ticket: String,
        conversation: String,
        view_id: String,
        source: String,
        #[serde(default)]
        restore: bool,
    },
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConversationDetection {
    #[default]
    NoChat,
    WaitingForMessages,
    UnsupportedMessages,
    Ambiguous,
    Empty,
    Ready,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum NativeCommand {
    Status,
    DownloadSpeechModel,
    VoiceEnabled {
        enabled: bool,
    },
    VoiceAuto {
        enabled: bool,
    },
    VoiceMaxMinutes {
        minutes: u8,
    },
    RefreshModels,
    SignIn {
        #[serde(default)]
        new_account: bool,
    },
    SignOut,
    Account {
        client_id: String,
    },
    Enable {
        enabled: bool,
        #[serde(default)]
        view_id: String,
    },
    Model {
        slug: String,
    },
    Reasoning {
        slug: String,
        effort: Option<crate::model_options::ReasoningEffort>,
    },
    Rules {
        view_id: String,
        rules: String,
    },
    ClearCache,
    ClearChatCache {
        view_id: String,
    },
    TranslationPreferences {
        preferences: TranslationPreferences,
    },
    AddLanguage {
        name: String,
        #[serde(default)]
        region: String,
    },
    ViewPreferences {
        preferences: ViewPreferences,
    },
}

pub fn parse_native(payload: &str) -> Result<NativeCommand> {
    ensure!(
        payload.len() <= MAX_NATIVE_PAYLOAD,
        "Native request is too large"
    );
    let mut command: NativeCommand = serde_json::from_str(payload)?;
    match &mut command {
        NativeCommand::VoiceMaxMinutes { minutes } => {
            ensure!(
                [5, 10, 20, 30].contains(minutes),
                "Choose 5, 10, 20 or 30 minutes"
            );
        }
        NativeCommand::Rules { view_id, rules } => {
            bounded_id(view_id)?;
            *rules = normalize_rules(rules)?;
        }
        NativeCommand::TranslationPreferences { preferences } => {
            preferences.global_rules = normalize_rules(&preferences.global_rules)?;
            preferences.reading_language = preferences.reading_language.clone().normalized()?;
            preferences.reply_language = preferences.reply_language.clone().normalized()?;
        }
        NativeCommand::AddLanguage { name, region } => {
            let language = CustomLanguage {
                name: name.clone(),
                region: region.clone(),
            }
            .normalized()?;
            *name = language.name;
            *region = language.region;
        }
        NativeCommand::ClearChatCache { view_id } => bounded_id(view_id)?,
        NativeCommand::Enable { view_id, .. } if !view_id.is_empty() => bounded_id(view_id)?,
        NativeCommand::Account { client_id } => bounded_id(client_id)?,
        NativeCommand::Model { slug } | NativeCommand::Reasoning { slug, .. } => bounded_id(slug)?,
        _ => {}
    }
    Ok(command)
}

pub fn bounded_id(value: &str) -> Result<()> {
    ensure!(
        !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control),
        "Invalid identifier"
    );
    Ok(())
}

impl TranslationRequest {
    pub fn validate(&self) -> Result<()> {
        bounded_id(&self.request_id)?;
        bounded_id(&self.conversation)?;
        bounded_id(&self.message_id)?;
        ensure!(
            !self.text.trim().is_empty() && self.text.len() <= MAX_TEXT,
            "Message is empty or too long"
        );
        ensure!(self.context.len() <= 8, "Too much conversation context");
        ensure!(
            self.purpose != TranslationPurpose::Reply || self.direction == Direction::Outgoing,
            "Replies must be outgoing"
        );
        ensure!(
            self.context.iter().all(|v| v.text.len() <= 2_000),
            "Context message is too long"
        );
        Ok(())
    }
}

pub fn parse_page(payload: &str) -> Result<PageRequest> {
    ensure!(payload.len() <= MAX_PAYLOAD, "Request is too large");
    let request = serde_json::from_str(payload)?;
    match &request {
        PageRequest::Appearance { .. } => {}
        PageRequest::ActiveConversation {
            conversation,
            title,
            view_id,
            message_ids,
            ..
        } => {
            // Identity may be absent before message anchors or an empty view are registered.
            if !conversation.is_empty() {
                bounded_id(conversation)?;
            }
            ensure!(title.len() <= 256, "Conversation title is too long");
            if !view_id.is_empty() {
                bounded_id(view_id)?;
            }
            ensure!(message_ids.len() <= 64, "Too many conversation anchors");
            for id in message_ids {
                bounded_id(id)?;
            }
        }
        PageRequest::Translate(request) => request.validate()?,
        PageRequest::VoiceBegin(request) | PageRequest::SavedVoice(request) => {
            for id in [
                &request.request_id,
                &request.conversation,
                &request.view_id,
                &request.message_id,
            ] {
                bounded_id(id)?;
            }
            ensure!(
                request
                    .language
                    .as_deref()
                    .is_none_or(crate::languages::speech_supported),
                "This language is not supported by the speech model"
            );
            ensure!(
                request.context.len() <= 8
                    && request.context.iter().all(|line| line.text.len() <= 2_000),
                "Too much voice-note context"
            );
        }
        PageRequest::VoiceAudio {
            request_id,
            conversation,
            view_id,
            pcm,
            ..
        } => {
            for id in [request_id, conversation, view_id] {
                bounded_id(id)?;
            }
            ensure!(
                !pcm.is_empty() && pcm.len() <= crate::speech::CHUNK_BYTES.div_ceil(3) * 4,
                "Invalid audio chunk"
            );
        }
        PageRequest::VoiceFinish {
            request_id,
            conversation,
            view_id,
        }
        | PageRequest::VoiceCancel {
            request_id,
            conversation,
            view_id,
        } => {
            for id in [request_id, conversation, view_id] {
                bounded_id(id)?;
            }
        }
        PageRequest::SpeechDownload {
            conversation,
            view_id,
        } => {
            bounded_id(conversation)?;
            bounded_id(view_id)?;
        }
        PageRequest::SavedMessages {
            request_id,
            conversation,
            view_id,
            messages,
        } => {
            for id in [request_id, conversation, view_id] {
                bounded_id(id)?;
            }
            ensure!(messages.len() <= 64, "Too many saved-message probes");
            for message in messages {
                bounded_id(&message.message_id)?;
                ensure!(
                    !message.text.trim().is_empty() && message.text.len() <= MAX_TEXT,
                    "Invalid message probe"
                );
            }
        }
        PageRequest::CancelTranslation {
            request_id,
            conversation,
        } => {
            bounded_id(request_id)?;
            bounded_id(conversation)?;
        }
        PageRequest::EditDraft {
            edit_id,
            ticket,
            conversation,
            view_id,
            source,
            ..
        } => {
            for id in [edit_id, ticket, conversation, view_id] {
                bounded_id(id)?;
            }
            ensure!(
                !source.trim().is_empty() && source.len() <= 24_000,
                "Draft is empty or too long"
            );
        }
    }
    Ok(request)
}

#[cfg(test)]
mod tests;
