mod model;
mod recognize;

use anyhow::{Result, ensure};
use base64::{Engine as _, engine::general_purpose::STANDARD};
pub use model::SpeechModel;
pub use recognize::transcribe;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, atomic::AtomicBool};

pub const SAMPLE_RATE: usize = 16_000;
pub const MAX_SAMPLES: usize = SAMPLE_RATE * 1800;
pub const CHUNK_BYTES: usize = 16_384;
pub const MODEL_SHA: &str = "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Transcript {
    pub text: String,
    pub language: String,
    pub confidence: Option<f32>,
    pub review: bool,
}

pub struct AudioTransfer {
    pub request_id: String,
    pub conversation: String,
    pub view_id: String,
    pub generation: u64,
    pub message_id: String,
    pub direction: crate::protocol::Direction,
    pub language: Option<String>,
    pub samples: Vec<f32>,
    pub max_samples: usize,
    pub next_chunk: u32,
    pub created_at: u64,
    pub cancelled: Arc<AtomicBool>,
}
impl AudioTransfer {
    pub fn append(&mut self, index: u32, encoded: &str) -> Result<()> {
        ensure!(
            index == self.next_chunk,
            "Voice-note chunks arrived out of order"
        );
        ensure!(
            encoded.len() <= CHUNK_BYTES.div_ceil(3) * 4,
            "Audio chunk is too large"
        );
        let bytes = STANDARD.decode(encoded)?;
        ensure!(
            !bytes.is_empty() && bytes.len() <= CHUNK_BYTES && bytes.len() % 2 == 0,
            "Invalid PCM audio chunk"
        );
        ensure!(
            self.samples.len() + bytes.len() / 2 <= self.max_samples.min(MAX_SAMPLES),
            "This voice note exceeds the maximum length in Languages settings"
        );
        self.samples.extend(
            bytes
                .chunks_exact(2)
                .map(|bytes| f32::from(i16::from_le_bytes([bytes[0], bytes[1]])) / 32768.0),
        );
        self.next_chunk += 1;
        Ok(())
    }
}

pub fn cache_key(conversation: &str, message_id: &str, language: Option<&str>) -> String {
    crate::storage::hash(
        &serde_json::json!([
            "wisp-voice-v1",
            MODEL_SHA,
            conversation,
            crate::conversation::message_hash(message_id),
            language.unwrap_or("auto")
        ])
        .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pcm_transport_is_ordered_bounded_and_little_endian() {
        let mut transfer = AudioTransfer {
            request_id: "request".into(),
            conversation: "chat".into(),
            view_id: "view".into(),
            generation: 1,
            message_id: "note".into(),
            direction: crate::protocol::Direction::Incoming,
            language: None,
            samples: vec![],
            max_samples: MAX_SAMPLES,
            next_chunk: 0,
            created_at: 0,
            cancelled: Arc::new(AtomicBool::new(false)),
        };
        assert!(transfer.append(1, "AAA=").is_err());
        assert!(transfer.append(0, "AA==").is_err());
        transfer
            .append(0, &STANDARD.encode([0, 128, 255, 127]))
            .unwrap();
        assert_eq!(transfer.samples[0], -1.0);
        assert!(transfer.samples[1] > 0.99);
        assert!(transfer.append(0, "AAA=").is_err());
        assert!(
            transfer
                .append(1, &STANDARD.encode(vec![0; CHUNK_BYTES + 2]))
                .is_err()
        );
        transfer.samples.resize(MAX_SAMPLES, 0.0);
        assert!(transfer.append(1, "AAA=").is_err());
    }
    #[test]
    fn transcripts_do_not_cross_chats_or_language_overrides() {
        assert_ne!(cache_key("a", "note", None), cache_key("b", "note", None));
        assert_ne!(
            cache_key("a", "note", None),
            cache_key("a", "note", Some("es"))
        );
    }
}
