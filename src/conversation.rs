use crate::storage::{hash, now};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub fn message_hash(id: &str) -> String {
    // Older records wrap the same opaque message key in peer/direction metadata.
    let bare = id.split('_').nth(2).filter(|key| {
        (16..=128).contains(&key.len()) && key.bytes().all(|b| b.is_ascii_hexdigit())
    });
    hash(bare.unwrap_or(id))
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ConversationAnchor {
    conversation: String,
    seen_at: u64,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(transparent)]
pub struct MessageAnchors {
    entries: BTreeMap<String, ConversationAnchor>,
}

impl MessageAnchors {
    pub fn candidates(&self, messages: &[String]) -> BTreeSet<String> {
        messages
            .iter()
            .filter_map(|id| self.entries.get(&message_hash(id)))
            .map(|anchor| anchor.conversation.clone())
            .collect()
    }

    // Called only after a native, current-view repair has validated the exact
    // candidate set. A normal page observation must never join identities.
    pub fn repair(&mut self, candidates: &BTreeSet<String>, canonical: &str, messages: &[String]) {
        for anchor in self.entries.values_mut() {
            if candidates.contains(&anchor.conversation) {
                anchor.conversation = canonical.to_owned();
            }
        }
        for id in messages {
            self.entries.insert(
                message_hash(id),
                ConversationAnchor {
                    conversation: canonical.to_owned(),
                    seen_at: now(),
                },
            );
        }
    }

    // Modern WhatsApp DOM IDs identify messages, not their chat. Link overlapping
    // message records to a native UUID; display names never participate in identity.
    pub fn identify(
        &mut self,
        peer: &str,
        messages: &[String],
        previous: Option<&str>,
    ) -> Result<String> {
        let known = self.candidates(messages);
        ensure!(
            known.len() <= 1,
            "Message records belong to different chats"
        );
        if let (Some(expected), Some(anchored)) = (previous, known.iter().next()) {
            ensure!(
                expected == anchored,
                "Message records conflict with the open conversation"
            );
        }
        let conversation = match known.into_iter().next() {
            Some(id) => {
                ensure!(
                    peer.is_empty() || id.starts_with("chat:") || id == peer,
                    "Conversation address conflicts with its message records"
                );
                id
            }
            None if previous.is_some() => previous.unwrap().to_owned(),
            None if !peer.is_empty() => peer.to_owned(),
            None => format!("chat:{}", uuid::Uuid::new_v4()),
        };
        for id in messages {
            self.entries.insert(
                message_hash(id),
                ConversationAnchor {
                    conversation: conversation.clone(),
                    seen_at: now(),
                },
            );
        }
        // Keep identities alongside saved translations. Expiring these would
        // make revisited history appear to belong to a new chat.
        Ok(conversation)
    }
}
