use super::{Transcript, model};
use anyhow::{Context, Result, ensure};
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

unsafe extern "C" fn abort(user: *mut std::ffi::c_void) -> bool {
    // SAFETY: transcribe owns an Arc to this flag until synchronous full() returns.
    unsafe { &*(user as *const AtomicBool) }.load(Ordering::Relaxed)
}
pub fn transcribe(
    path: &Path,
    samples: &[f32],
    override_language: Option<&str>,
    cancelled: Arc<AtomicBool>,
) -> Result<Transcript> {
    ensure!(
        !cancelled.load(Ordering::Relaxed),
        "Transcription cancelled"
    );
    ensure!(
        samples.len() >= 4_000,
        "The voice note is too short to transcribe"
    );
    let rms =
        (samples.iter().map(|n| f64::from(*n).powi(2)).sum::<f64>() / samples.len() as f64).sqrt();
    ensure!(rms > 0.0001, "No clear speech was found in this recording");
    model::verify(path)?;
    whisper_rs::install_logging_hooks();
    let mut context_params = WhisperContextParameters::default();
    context_params.use_gpu(cfg!(all(target_os = "macos", target_arch = "aarch64")));
    let context = WhisperContext::new_with_params(path, context_params)
        .or_else(|error| {
            if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
                return Err(error);
            }
            let mut cpu = WhisperContextParameters::default();
            cpu.use_gpu(false);
            WhisperContext::new_with_params(path, cpu)
        })
        .context("Could not load the speech model")?;
    let mut state = context.create_state()?;
    let threads = std::thread::available_parallelism().map_or(2, |n| n.get().clamp(1, 4));
    let (language, confidence) = if let Some(code) = override_language {
        ensure!(
            crate::languages::speech_supported(code),
            "This language is not supported by the speech model"
        );
        (code.to_owned(), None)
    } else {
        state.pcm_to_mel(
            &samples[..samples.len().min(30 * super::SAMPLE_RATE)],
            threads,
        )?;
        let (id, probabilities) = state.lang_detect(0, threads)?;
        let code =
            whisper_rs::get_lang_str(id).context("Could not identify the spoken language")?;
        let probability = probabilities[id as usize];
        let second = probabilities
            .iter()
            .enumerate()
            .filter(|(index, _)| *index != id as usize)
            .map(|(_, value)| *value)
            .fold(0.0f32, f32::max);
        ensure!(
            confident_language(probability, second),
            "The spoken language is unclear. Choose the language below and retry"
        );
        ensure!(
            crate::languages::speech_supported(code),
            "The detected language is not supported by the speech model"
        );
        (code.to_owned(), Some(probability))
    };
    ensure!(
        !cancelled.load(Ordering::Relaxed),
        "Transcription cancelled"
    );
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(threads as i32);
    params.set_language(Some(&language));
    params.set_translate(false);
    params.set_no_context(true);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_nst(true);
    // SAFETY: the pointer refers to cancelled, kept alive across full(). The
    // callback only reads an atomic flag and cannot panic or access speech text.
    unsafe {
        params.set_abort_callback(Some(abort));
        params.set_abort_callback_user_data(Arc::as_ptr(&cancelled) as *mut std::ffi::c_void);
    }
    state
        .full(params, samples)
        .context("Could not transcribe this voice note. Try a language override")?;
    ensure!(
        !cancelled.load(Ordering::Relaxed),
        "Transcription cancelled"
    );
    let mut text = String::new();
    let mut review = false;
    for segment in state.as_iter() {
        let uncertain = segment.no_speech_probability();
        if uncertain > 0.8 {
            review = true;
            continue;
        }
        if uncertain > 0.4 {
            review = true;
        }
        text.push_str(&segment.to_str_lossy()?);
    }
    let text = text.trim().to_owned();
    ensure!(
        !text.is_empty(),
        "No clear speech was found. Choose a language and retry"
    );
    ensure!(
        text.len() <= 32_000,
        "This transcript is too long to translate. Use a shorter recording"
    );
    Ok(Transcript {
        text,
        language,
        confidence,
        review,
    })
}
fn confident_language(first: f32, second: f32) -> bool {
    first.is_finite() && second.is_finite() && first >= 0.65 && first - second >= 0.2
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uncertain_detection_requires_a_language_override() {
        assert!(confident_language(0.85, 0.10));
        assert!(!confident_language(0.55, 0.30));
        assert!(!confident_language(0.70, 0.60));
        assert!(!confident_language(f32::NAN, 0.0));
        assert!(
            transcribe(
                Path::new("missing"),
                &vec![0.0; 16_000],
                None,
                Arc::new(AtomicBool::new(false))
            )
            .is_err()
        );
    }
    #[tokio::test]
    #[ignore = "downloads the optional model and uses a local PCM recording"]
    async fn real_recording_detects_spanish_and_preserves_the_original() {
        let root = std::path::PathBuf::from(std::env::var("WISP_TEST_SPEECH_DIR").unwrap());
        let model = model::SpeechModel::new(&root);
        if !model.status().ready {
            model.download(|_| {}).await.unwrap();
        }
        let bytes = std::fs::read(root.join("spanish.pcm")).unwrap();
        let samples: Vec<_> = bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|n| f32::from(i16::from_le_bytes([n[0], n[1]])) / 32768.0)
            .collect();
        let cancelled = Arc::new(AtomicBool::new(false));
        let transcript = transcribe(&model.path(), &samples, None, cancelled.clone()).unwrap();
        assert_eq!(transcript.language, "es");
        assert!(
            transcript.text.to_lowercase().contains("mañana"),
            "{}",
            transcript.text
        );
        assert!(
            transcript.text.to_lowercase().contains("parque"),
            "{}",
            transcript.text
        );
        let manual = transcribe(&model.path(), &samples, Some("es"), cancelled.clone()).unwrap();
        assert_eq!(manual.language, "es");
        assert_eq!(manual.confidence, None);
        assert!(!manual.text.is_empty());
        cancelled.store(true, Ordering::Relaxed);
        assert!(transcribe(&model.path(), &samples, None, cancelled).is_err());
    }
}
