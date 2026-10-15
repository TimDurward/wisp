pub(crate) mod persistence;
use crate::preferences::{
    ConversationPreferences, CustomLanguage, Language, TranslationPreferences, ViewPreferences,
    normalize_rules,
};
use anyhow::{Context, Result, ensure};
use persistence::private_write;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Account {
    pub client_id: String,
    pub subject: String,
    pub email: String,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Settings {
    pub host_id: String,
    pub accounts: Vec<Account>,
    pub active_account: Option<String>,
    pub model: Option<String>,
    pub model_reasoning: BTreeMap<String, crate::model_options::ReasoningEffort>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub enabled: BTreeMap<String, bool>,
    pub conversations: BTreeMap<String, ConversationPreferences>,
    pub welcomed: bool,
    pub message_chats: crate::conversation::MessageAnchors,
    pub view_preferences: ViewPreferences,
    pub translation_preferences: TranslationPreferences,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub custom_languages: Vec<CustomLanguage>,
    pub history_revision: u64,
    pub voice_enabled: bool,
    pub voice_max_minutes: Option<u8>,
    pub voice_auto: Option<bool>,
}

#[derive(Clone, Deserialize, Serialize)]
struct CacheEntry {
    text: String,
    saved_at: u64,
    #[serde(default)]
    chat_hash: String,
}
#[derive(Clone, Deserialize, Serialize)]
struct SavedMessage {
    text: String,
    chat_hash: String,
}
#[derive(Clone, Deserialize, Serialize)]
struct SavedTranscript {
    transcript: crate::speech::Transcript,
    chat_hash: String,
    #[serde(default)]
    message_hash: String,
    #[serde(default)]
    language_override: Option<String>,
    #[serde(default)]
    selected_at: u64,
}

pub struct Storage {
    root: PathBuf,
    pub settings: Settings,
    cache: BTreeMap<String, CacheEntry>,
    messages: BTreeMap<String, SavedMessage>,
    transcripts: BTreeMap<String, SavedTranscript>,
}

impl Storage {
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
        }
        let read = |name: &str| -> Result<Option<Vec<u8>>> {
            match fs::read(root.join(name)) {
                Ok(data) => Ok(Some(data)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e.into()),
            }
        };
        let mut settings: Settings = read("settings.json")?
            .map(|v| serde_json::from_slice(&v))
            .transpose()
            .context("Cannot read Wisp settings")?
            .unwrap_or_default();
        if settings.host_id.is_empty() {
            settings.host_id = format!("urn:uuid:{}", uuid::Uuid::new_v4());
        }
        if settings
            .voice_max_minutes
            .is_none_or(|n| ![5, 10, 20, 30].contains(&n))
        {
            settings.voice_max_minutes = Some(10);
        }
        // Preserve opt-ins from the original settings format.
        for (key, enabled) in std::mem::take(&mut settings.enabled) {
            settings
                .conversations
                .entry(key)
                .or_insert_with(|| ConversationPreferences {
                    enabled,
                    rules: String::new(),
                    cache_epoch: 0,
                });
        }
        let cache = read("translations.json")?
            .and_then(|v| serde_json::from_slice(&v).ok())
            .unwrap_or_default();
        let messages = read("saved-messages.json")?
            .map(|data| serde_json::from_slice(&data))
            .transpose()
            .context("Cannot read saved message translations")?
            .unwrap_or_default();
        let transcripts = read("voice-transcripts.json")?
            .map(|data| serde_json::from_slice(&data))
            .transpose()
            .context("Cannot read saved voice transcripts")?
            .unwrap_or_default();
        let mut storage = Self {
            root,
            settings,
            cache,
            messages,
            transcripts,
        };
        storage.prune();
        storage.save()?;
        Ok(storage)
    }
    pub fn save(&self) -> Result<()> {
        private_write(
            &self.root.join("settings.json"),
            &serde_json::to_vec_pretty(&self.settings)?,
        )
    }
    pub fn transcript(&self, key: &str, conversation: &str) -> Option<crate::speech::Transcript> {
        self.transcripts
            .get(key)
            .filter(|saved| saved.chat_hash == hash(conversation))
            .map(|saved| saved.transcript.clone())
    }
    pub fn save_transcript(
        &mut self,
        key: String,
        conversation: &str,
        transcript: crate::speech::Transcript,
    ) -> Result<()> {
        let previous = self.transcripts.insert(
            key.clone(),
            SavedTranscript {
                transcript,
                chat_hash: hash(conversation),
                message_hash: String::new(),
                language_override: None,
                selected_at: 0,
            },
        );
        if let Err(error) = self.persist_transcripts() {
            if let Some(previous) = previous {
                self.transcripts.insert(key, previous);
            } else {
                self.transcripts.remove(&key);
            }
            return Err(error);
        }
        Ok(())
    }
    fn persist_transcripts(&self) -> Result<()> {
        private_write(
            &self.root.join("voice-transcripts.json"),
            &serde_json::to_vec(&self.transcripts)?,
        )
    }
    pub fn remember_voice(
        &mut self,
        conversation: &str,
        message_id: &str,
        language: Option<&str>,
    ) -> Result<()> {
        let key = crate::speech::cache_key(conversation, message_id, language);
        let selected_at = self
            .transcripts
            .values()
            .map(|v| v.selected_at)
            .max()
            .unwrap_or_default()
            .saturating_add(1);
        let Some(saved) = self
            .transcripts
            .get_mut(&key)
            .filter(|v| v.chat_hash == hash(conversation))
        else {
            return Ok(());
        };
        let previous = saved.clone();
        saved.message_hash = crate::conversation::message_hash(message_id);
        saved.language_override = language.map(str::to_owned);
        saved.selected_at = selected_at;
        if let Err(error) = self.persist_transcripts() {
            self.transcripts.insert(key, previous);
            return Err(error);
        }
        Ok(())
    }
    pub fn voice_transcript(
        &self,
        conversation: &str,
        message_id: &str,
    ) -> Option<(crate::speech::Transcript, Option<String>)> {
        let chat_hash = hash(conversation);
        let message_hash = crate::conversation::message_hash(message_id);
        if let Some(saved) = self
            .transcripts
            .values()
            .filter(|v| v.chat_hash == chat_hash && v.message_hash == message_hash)
            .max_by_key(|v| v.selected_at)
        {
            return Some((saved.transcript.clone(), saved.language_override.clone()));
        }
        let automatic = crate::speech::cache_key(conversation, message_id, None);
        if let Some(transcript) = self.transcript(&automatic, conversation) {
            return Some((transcript, None));
        }
        crate::languages::ALL.iter().find_map(|(code, _)| {
            let key = crate::speech::cache_key(conversation, message_id, Some(code));
            self.transcript(&key, conversation)
                .map(|transcript| (transcript, Some((*code).to_owned())))
        })
    }
    pub fn transcript_count(&self) -> usize {
        self.transcripts.len()
    }
    pub fn enabled(&self, conversation: &str) -> bool {
        self.settings
            .conversations
            .get(&hash(conversation))
            .is_some_and(|preferences| preferences.enabled)
    }
    pub fn preferences(&self, conversation: &str) -> ConversationPreferences {
        self.settings
            .conversations
            .get(&hash(conversation))
            .cloned()
            .unwrap_or_default()
    }
    fn update_preferences(
        &mut self,
        conversation: &str,
        preferences: ConversationPreferences,
    ) -> Result<()> {
        ensure!(!conversation.is_empty(), "Open a conversation first");
        let key = hash(conversation);
        let previous = self.settings.conversations.insert(key.clone(), preferences);
        if let Err(error) = self.save() {
            if let Some(previous) = previous {
                self.settings.conversations.insert(key, previous);
            } else {
                self.settings.conversations.remove(&key);
            }
            return Err(error);
        }
        Ok(())
    }
    pub fn set_enabled(&mut self, conversation: &str, enabled: bool) -> Result<()> {
        let mut preferences = self.preferences(conversation);
        preferences.enabled = enabled;
        self.update_preferences(conversation, preferences)
    }
    pub fn set_rules(&mut self, conversation: &str, rules: &str) -> Result<()> {
        let mut preferences = self.preferences(conversation);
        preferences.rules = normalize_rules(rules)?;
        self.update_preferences(conversation, preferences)
    }
    pub fn set_view_preferences(&mut self, preferences: ViewPreferences) -> Result<()> {
        let previous = std::mem::replace(&mut self.settings.view_preferences, preferences);
        if let Err(error) = self.save() {
            self.settings.view_preferences = previous;
            return Err(error);
        }
        Ok(())
    }
    pub fn set_reasoning(
        &mut self,
        slug: String,
        effort: Option<crate::model_options::ReasoningEffort>,
    ) -> Result<()> {
        let previous = self.settings.model_reasoning.clone();
        if let Some(effort) = effort {
            self.settings.model_reasoning.insert(slug, effort);
        } else {
            self.settings.model_reasoning.remove(&slug);
        }
        if let Err(error) = self.save() {
            self.settings.model_reasoning = previous;
            return Err(error);
        }
        Ok(())
    }
    pub fn set_translation_preferences(
        &mut self,
        preferences: TranslationPreferences,
    ) -> Result<()> {
        for language in [&preferences.reading_language, &preferences.reply_language] {
            if let Language::Custom(language) = language {
                ensure!(
                    self.settings.custom_languages.contains(language),
                    "Add this language before selecting it"
                );
            }
        }
        let previous = std::mem::replace(&mut self.settings.translation_preferences, preferences);
        if let Err(error) = self.save() {
            self.settings.translation_preferences = previous;
            return Err(error);
        }
        Ok(())
    }
    pub fn add_language(&mut self, language: CustomLanguage) -> Result<()> {
        let language = language.normalized()?;
        if self.settings.custom_languages.iter().any(|saved| {
            saved.name.to_lowercase() == language.name.to_lowercase()
                && saved.region.to_lowercase() == language.region.to_lowercase()
        }) {
            return Ok(());
        }
        ensure!(
            self.settings.custom_languages.len() < 64,
            "You can save up to 64 custom languages and regions"
        );
        self.settings.custom_languages.push(language);
        if let Err(error) = self.save() {
            self.settings.custom_languages.pop();
            return Err(error);
        }
        Ok(())
    }
    pub fn saved_message(&self, key: &str, conversation: &str) -> Option<String> {
        self.messages
            .get(key)
            .filter(|entry| entry.chat_hash == hash(conversation))
            .map(|entry| entry.text.clone())
    }
    pub fn save_message(&mut self, key: String, conversation: &str, text: String) -> Result<()> {
        ensure!(text.len() <= 24_000, "Translation is too long");
        let previous = self.messages.insert(
            key.clone(),
            SavedMessage {
                text,
                chat_hash: hash(conversation),
            },
        );
        if let Err(error) = private_write(
            &self.root.join("saved-messages.json"),
            &serde_json::to_vec(&self.messages)?,
        ) {
            if let Some(previous) = previous {
                self.messages.insert(key, previous);
            } else {
                self.messages.remove(&key);
            }
            return Err(error);
        }
        Ok(())
    }
    pub fn saved_count(&self) -> usize {
        self.messages.len()
    }
    pub fn chat_cache_count(&self, conversation: &str) -> usize {
        let chat = hash(conversation);
        self.messages
            .values()
            .filter(|entry| entry.chat_hash == chat)
            .count()
            + self
                .cache
                .values()
                .filter(|entry| entry.chat_hash == chat)
                .count()
    }
    pub fn identify_chat(
        &mut self,
        peer: &str,
        messages: &[String],
        previous: Option<&str>,
    ) -> Result<String> {
        let conversation = self
            .settings
            .message_chats
            .identify(peer, messages, previous)?;
        self.save()?;
        Ok(conversation)
    }
    fn prune(&mut self) {
        self.cache
            .retain(|_, entry| now().saturating_sub(entry.saved_at) < 30 * 86400);
        while self.cache.len() > 2_000 {
            if let Some(key) = self
                .cache
                .iter()
                .min_by_key(|(_, e)| e.saved_at)
                .map(|(k, _)| k.clone())
            {
                self.cache.remove(&key);
            }
        }
    }
    pub fn cached(&self, key: &str) -> Option<String> {
        self.cache
            .get(key)
            .filter(|e| now().saturating_sub(e.saved_at) < 30 * 86400)
            .map(|e| e.text.clone())
    }
    #[cfg(test)]
    pub fn cache(&mut self, key: String, text: String) -> Result<()> {
        self.cache_for_chat(key, text, "")
    }
    pub fn cache_for_chat(&mut self, key: String, text: String, conversation: &str) -> Result<()> {
        ensure!(text.len() <= 24_000, "Translation is too long");
        self.cache.insert(
            key,
            CacheEntry {
                text,
                saved_at: now(),
                chat_hash: if conversation.is_empty() {
                    String::new()
                } else {
                    hash(conversation)
                },
            },
        );
        self.prune();
        private_write(
            &self.root.join("translations.json"),
            &serde_json::to_vec(&self.cache)?,
        )
    }
    pub fn clear_cache(&mut self) -> Result<()> {
        private_write(&self.root.join("voice-transcripts.json"), b"{}")?;
        self.transcripts.clear();
        private_write(&self.root.join("saved-messages.json"), b"{}")?;
        self.messages.clear();
        private_write(&self.root.join("translations.json"), b"{}")?;
        self.cache.clear();
        self.settings.history_revision += 1;
        self.save()?;
        Ok(())
    }
    pub fn clear_chat_cache(&mut self, conversation: &str) -> Result<()> {
        let chat = hash(conversation);
        let transcripts: BTreeMap<_, _> = self
            .transcripts
            .iter()
            .filter(|(_, entry)| entry.chat_hash != chat)
            .map(|(key, entry)| (key.clone(), entry.clone()))
            .collect();
        private_write(
            &self.root.join("voice-transcripts.json"),
            &serde_json::to_vec(&transcripts)?,
        )?;
        self.transcripts = transcripts;
        let messages: BTreeMap<_, _> = self
            .messages
            .iter()
            .filter(|(_, entry)| entry.chat_hash != chat)
            .map(|(key, entry)| (key.clone(), entry.clone()))
            .collect();
        let cache: BTreeMap<_, _> = self
            .cache
            .iter()
            .filter(|(_, entry)| entry.chat_hash != chat)
            .map(|(key, entry)| (key.clone(), entry.clone()))
            .collect();
        private_write(
            &self.root.join("saved-messages.json"),
            &serde_json::to_vec(&messages)?,
        )?;
        private_write(
            &self.root.join("translations.json"),
            &serde_json::to_vec(&cache)?,
        )?;
        self.messages = messages;
        self.cache = cache;
        let mut preferences = self.preferences(conversation);
        preferences.cache_epoch += 1;
        self.update_preferences(conversation, preferences)?;
        self.settings.history_revision += 1;
        self.save()
    }
    pub fn cache_count(&self) -> usize {
        self.cache.len()
    }
}

#[cfg(test)]
mod tests;
