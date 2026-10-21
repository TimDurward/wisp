use super::*;
use crate::{
    protocol::VoiceRequest,
    speech::{self, AudioTransfer, Transcript},
};
use std::sync::atomic::{AtomicBool, Ordering};

impl Engine {
    pub(super) async fn enable_voice(&self, enabled: bool) -> Result<()> {
        let mut state = self.state.lock().await;
        state.storage.settings.voice_enabled = enabled;
        state.storage.save()?;
        if !enabled {
            if let Some((audio, _)) = state.voice_transfer.take() {
                audio.cancelled.store(true, Ordering::Relaxed);
                state.requests.remove(&audio.request_id);
            }
            self.speech.cancel_download();
        }
        drop(state);
        self.status().await;
        self.config().await;
        if enabled && !self.speech.status().ready && !self.speech.status().downloading {
            self.download_speech().await?;
        }
        Ok(())
    }
    pub(super) fn voice_languages() -> Vec<Value> {
        let mut languages: Vec<_> = crate::languages::ALL.iter().map(|(code, label)|
            json!({"code":code,"label":label,"supported":crate::languages::speech_supported(code)})).collect();
        languages.sort_by(|a, b| a["label"].as_str().cmp(&b["label"].as_str()));
        languages
    }
    pub(super) async fn download_speech(&self) -> Result<()> {
        let result = self
            .speech
            .download(|status| {
                self.emit_desktop(json!({"type":"speech_model","speech":status}));
                self.emit_page(json!({"type":"speech_model","speech":status}));
            })
            .await;
        if !self.state.lock().await.storage.settings.voice_enabled {
            return Ok(());
        }
        result
    }
    pub(super) async fn voice_page(self: Arc<Self>, request: PageRequest) {
        let terminal = matches!(
            &request,
            PageRequest::VoiceFinish { .. } | PageRequest::VoiceBegin(_)
        );
        let (id, conversation, view) = match &request {
            PageRequest::VoiceBegin(v) | PageRequest::SavedVoice(v) => (
                v.request_id.clone(),
                v.conversation.clone(),
                v.view_id.clone(),
            ),
            PageRequest::VoiceAudio {
                request_id,
                conversation,
                view_id,
                ..
            }
            | PageRequest::VoiceFinish {
                request_id,
                conversation,
                view_id,
            }
            | PageRequest::VoiceCancel {
                request_id,
                conversation,
                view_id,
            } => (request_id.clone(), conversation.clone(), view_id.clone()),
            PageRequest::SpeechDownload {
                conversation,
                view_id,
            } => (String::new(), conversation.clone(), view_id.clone()),
            _ => return,
        };
        if let Err(error) = self.clone().handle_voice(request).await {
            let mut state = self.state.lock().await;
            if state.view_id == view && state.conversation == conversation {
                if state
                    .voice_transfer
                    .as_ref()
                    .is_some_and(|(v, _)| v.request_id == id)
                {
                    state.voice_transfer.take();
                }
                state.requests.remove(&id);
                self.emit_page(
                    json!({"type":"voice_error","request_id":id,"conversation":conversation,
                    "view_id":view,"message":error.to_string()}),
                );
            }
        }
        if terminal {
            let mut state = self.state.lock().await;
            if state
                .voice_transfer
                .as_ref()
                .is_none_or(|(audio, _)| audio.request_id != id)
            {
                state.requests.remove(&id);
            }
        }
    }
    async fn handle_voice(self: Arc<Self>, request: PageRequest) -> Result<()> {
        match request {
            PageRequest::SavedVoice(request) => self.saved_voice(request).await?,
            PageRequest::SpeechDownload {
                conversation,
                view_id,
            } => {
                let state = self.state.lock().await;
                ensure!(
                    state.conversation == conversation
                        && state.view_id == view_id
                        && state.storage.enabled(&conversation),
                    "Open an enabled chat before setting up voice notes"
                );
                drop(state);
                self.enable_voice(true).await?;
            }
            PageRequest::VoiceBegin(request) => self.begin_voice(request).await?,
            PageRequest::VoiceAudio {
                request_id,
                conversation,
                view_id,
                index,
                pcm,
            } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.storage.settings.voice_enabled
                        && state.conversation == conversation
                        && state.view_id == view_id
                        && state.storage.enabled(&conversation),
                    "The chat changed. Try this voice note again"
                );
                let generation = state.generation;
                let (audio, _) = state
                    .voice_transfer
                    .as_mut()
                    .context("Voice-note transfer has expired")?;
                ensure!(
                    audio.request_id == request_id
                        && audio.view_id == view_id
                        && audio.conversation == conversation
                        && audio.generation == generation
                        && now().saturating_sub(audio.created_at) < 60,
                    "Voice-note transfer has expired"
                );
                audio.append(index, &pcm)?;
                audio.created_at = now();
                self.emit_page(json!({"type":"voice_ack","request_id":request_id,"conversation":conversation,"view_id":view_id,"index":index}));
            }
            PageRequest::VoiceFinish {
                request_id,
                conversation,
                view_id,
            } => {
                let (audio, context, permit) = {
                    let mut state = self.state.lock().await;
                    ensure!(
                        state.storage.settings.voice_enabled
                            && state.conversation == conversation
                            && state.view_id == view_id
                            && state.storage.enabled(&conversation),
                        "The chat changed. Try this voice note again"
                    );
                    let generation = state.generation;
                    let (audio, _) = state
                        .voice_transfer
                        .as_ref()
                        .context("Voice-note transfer has expired")?;
                    ensure!(
                        audio.request_id == request_id
                            && audio.view_id == view_id
                            && audio.conversation == conversation
                            && audio.generation == generation
                            && now().saturating_sub(audio.created_at) < 60,
                        "Voice-note transfer has expired"
                    );
                    let permit = self
                        .voice_permits
                        .clone()
                        .try_acquire_owned()
                        .context("Another voice note is being transcribed")?;
                    let (audio, context) = state.voice_transfer.take().unwrap();
                    (audio, context, permit)
                };
                self.emit_page(json!({"type":"voice_status","request_id":request_id,"conversation":conversation,"view_id":view_id,"stage":"transcribing"}));
                let generation = audio.generation;
                let cancelled = audio.cancelled.clone();
                let language = audio.language.clone();
                let message_id = audio.message_id.clone();
                let direction = audio.direction;
                let path = self.speech.path();
                let mut task = tokio::task::spawn_blocking(move || {
                    let _permit = permit;
                    speech::transcribe(
                        &path,
                        &audio.samples,
                        audio.language.as_deref(),
                        audio.cancelled,
                    )
                });
                let stop = async {
                    loop {
                        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                        let state = self.state.lock().await;
                        if !state.storage.settings.voice_enabled
                            || !state.current(&conversation, generation)
                            || !state.requests.contains(&request_id)
                        {
                            cancelled.store(true, Ordering::Relaxed);
                            break;
                        }
                    }
                };
                let transcript = tokio::select! {
                    result = &mut task => result??,
                    _ = stop => { return Ok(()); }
                };
                let mut state = self.state.lock().await;
                if !state.current(&conversation, generation)
                    || state.view_id != view_id
                    || !state.requests.contains(&request_id)
                {
                    return Ok(());
                }
                state.storage.save_transcript(
                    speech::cache_key(&conversation, &message_id, language.as_deref()),
                    &conversation,
                    transcript.clone(),
                )?;
                state
                    .storage
                    .remember_voice(&conversation, &message_id, language.as_deref())?;
                drop(state);
                self.translate_voice(
                    VoiceRequest {
                        request_id,
                        conversation,
                        view_id,
                        message_id,
                        direction,
                        language,
                        retranscribe: false,
                        context,
                    },
                    transcript,
                )
                .await?;
            }
            PageRequest::VoiceCancel {
                request_id,
                conversation,
                view_id,
            } => {
                let mut state = self.state.lock().await;
                if state.conversation == conversation && state.view_id == view_id {
                    if state
                        .voice_transfer
                        .as_ref()
                        .is_some_and(|(audio, _)| audio.request_id == request_id)
                    {
                        let (audio, _) = state.voice_transfer.take().unwrap();
                        audio.cancelled.store(true, Ordering::Relaxed);
                    }
                    state.requests.remove(&request_id);
                    state.cancelled.push_back(request_id);
                    while state.cancelled.len() > 128 {
                        state.cancelled.pop_front();
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
    async fn begin_voice(&self, request: VoiceRequest) -> Result<()> {
        let mut state = self.state.lock().await;
        ensure!(
            state.storage.settings.voice_enabled
                && state.conversation == request.conversation
                && state.view_id == request.view_id
                && state.storage.enabled(&request.conversation),
            "Voice-note translation is disabled for this chat"
        );
        ensure!(
            state.message_ids.contains(&request.message_id),
            "The voice note is no longer in this chat"
        );
        ensure!(
            request.direction != Direction::Outgoing
                || state.storage.settings.view_preferences.include_sent,
            "Translation is disabled for sent messages"
        );
        ensure!(
            state.translation_ready,
            "Connect ChatGPT and choose an available model first"
        );
        if state.cancelled.contains(&request.request_id)
            || state.requests.contains(&request.request_id)
        {
            return Ok(());
        }
        if let Some(transcript) = state
            .storage
            .transcript_for_message(
                &request.conversation,
                &request.message_id,
                request.language.as_deref(),
            )
            .filter(|_| !request.retranscribe)
        {
            state.storage.remember_voice(
                &request.conversation,
                &request.message_id,
                request.language.as_deref(),
            )?;
            state.requests.insert(request.request_id.clone());
            drop(state);
            self.translate_voice(request, transcript).await?;
            return Ok(());
        }
        ensure!(
            self.speech.status().ready,
            "Download the speech model in Languages settings first"
        );
        if state.voice_transfer.as_ref().is_some_and(|(audio, _)| {
            !state.current(&audio.conversation, audio.generation)
                || now().saturating_sub(audio.created_at) >= 60
        }) {
            let (audio, _) = state.voice_transfer.take().unwrap();
            state.requests.remove(&audio.request_id);
        }
        ensure!(
            state.voice_transfer.is_none() && self.voice_permits.available_permits() > 0,
            "Another voice note is being transcribed. Wait for it to finish"
        );
        let generation = state.generation;
        state.requests.insert(request.request_id.clone());
        state.voice_transfer = Some((
            AudioTransfer {
                request_id: request.request_id.clone(),
                conversation: request.conversation.clone(),
                view_id: request.view_id.clone(),
                generation,
                message_id: request.message_id.clone(),
                direction: request.direction,
                language: request.language,
                samples: vec![],
                max_samples: speech::SAMPLE_RATE
                    * 60
                    * usize::from(state.storage.settings.voice_max_minutes.unwrap_or(10)),
                next_chunk: 0,
                created_at: now(),
                cancelled: Arc::new(AtomicBool::new(false)),
            },
            request.context,
        ));
        self.emit_page(json!({"type":"voice_ack","request_id":request.request_id,"conversation":request.conversation,"view_id":request.view_id,"index":-1}));
        Ok(())
    }
    async fn saved_voice(&self, request: VoiceRequest) -> Result<()> {
        let mut state = self.state.lock().await;
        if state.conversation != request.conversation
            || state.view_id != request.view_id
            || !state.storage.enabled(&request.conversation)
            || !state.message_ids.contains(&request.message_id)
        {
            return Ok(());
        }
        let saved = if request.direction == Direction::Outgoing
            && !state.storage.settings.view_preferences.include_sent
        {
            None
        } else {
            state
                .storage
                .voice_transcript(&request.conversation, &request.message_id)
        };
        let (transcript, language, text) = if let Some((transcript, language)) = saved {
            let translation_request = TranslationRequest {
                request_id: request.request_id.clone(),
                conversation: request.conversation.clone(),
                message_id: request.message_id.clone(),
                direction: request.direction,
                purpose: TranslationPurpose::Voice,
                text: transcript.text.clone(),
                context: request.context,
            };
            let preferences = &state.storage.settings.translation_preferences;
            let history_key = translation::saved_key(&translation_request, preferences);
            let mut text = state
                .storage
                .saved_message_for(&translation_request, preferences);
            // Migrate completed voice translations saved by earlier builds.
            // This reads only local metadata/cache; it never contacts ChatGPT.
            if text.is_none() {
                if let (Some(account), Some(model)) = (
                    &state.storage.settings.active_account,
                    &state.storage.settings.model,
                ) {
                    let options = inference::Options::new(
                        model.clone(),
                        state.storage.settings.model_reasoning.get(model).copied(),
                    );
                    let chat = state.storage.preferences(&request.conversation);
                    text = state.storage.cached_for_request(
                        account,
                        &options.cache_model(),
                        &translation_request,
                        &chat.rules,
                        preferences,
                        chat.cache_epoch,
                    );
                }
                if let Some(text) = &text {
                    state
                        .storage
                        .save_message(history_key, &request.conversation, text.clone())?;
                }
            }
            if text.is_none() && translation::links::only_links(&transcript.text) {
                text = Some(transcript.text.clone());
            }
            (Some(transcript), language, text)
        } else {
            (None, None, None)
        };
        self.emit_page(json!({"type":"voice_saved","request_id":request.request_id,"conversation":request.conversation,"view_id":request.view_id,"transcript":transcript,"language":language,"translation":text}));
        Ok(())
    }
    async fn translate_voice(&self, request: VoiceRequest, transcript: Transcript) -> Result<()> {
        self.emit_page(json!({"type":"voice_transcript","request_id":request.request_id,"conversation":request.conversation,
            "view_id":request.view_id,"transcript":transcript}));
        let id = request.request_id.clone();
        let result = self
            .translate(TranslationRequest {
                request_id: request.request_id,
                conversation: request.conversation,
                message_id: request.message_id,
                direction: request.direction,
                purpose: TranslationPurpose::Voice,
                text: transcript.text,
                context: request.context,
            })
            .await;
        self.state.lock().await.requests.remove(&id);
        result
    }
}
