use super::*;

impl Engine {
    pub async fn page(self: Arc<Self>, request: PageRequest, sequence: u64) {
        match request {
            PageRequest::Appearance { dark } => {
                self.emit_desktop(json!({"type":"appearance","dark":dark}))
            }
            request @ (PageRequest::VoiceBegin(_)
            | PageRequest::SavedVoice(_)
            | PageRequest::VoiceAudio { .. }
            | PageRequest::VoiceFinish { .. }
            | PageRequest::VoiceCancel { .. }
            | PageRequest::SpeechDownload { .. }) => self.voice_page(request).await,
            PageRequest::SavedMessages {
                request_id,
                conversation,
                view_id,
                messages,
            } => {
                let state = self.state.lock().await;
                if state.conversation != conversation
                    || state.view_id != view_id
                    || !state.storage.enabled(&conversation)
                {
                    return;
                }
                let items: Vec<_> = messages
                    .into_iter()
                    .filter_map(|message| {
                        if message.direction == Direction::Outgoing
                            && !state.storage.settings.view_preferences.include_sent
                        {
                            return None;
                        }
                        let key = translation::history_key(
                            &conversation,
                            &message.message_id,
                            message.direction,
                            &message.text,
                            &state.storage.settings.translation_preferences,
                        );
                        state
                            .storage
                            .saved_message(&key, &conversation)
                            .map(|text| json!({"message_id":message.message_id,"text":text}))
                    })
                    .collect();
                self.emit_page(json!({"type":"saved_messages","request_id":request_id,"conversation":conversation,"view_id":view_id,"items":items}));
            }
            PageRequest::ActiveConversation {
                conversation,
                title,
                detection,
                view_id,
                message_ids,
            } => {
                let mut state = self.state.lock().await;
                // Work may execute on either Tokio worker. Older navigation updates
                // must never overwrite a newer conversation received on the Qt thread.
                if sequence < state.active_sequence {
                    return;
                }
                state.active_sequence = sequence;
                state.message_ids = message_ids.clone();
                state.detection = detection;
                let conversation = if !message_ids.is_empty()
                    || (matches!(detection, ConversationDetection::Empty) && !view_id.is_empty())
                {
                    let previous = (state.view_id == view_id && !state.conversation.is_empty())
                        .then(|| state.conversation.clone());
                    match state.storage.identify_chat(
                        &conversation,
                        &message_ids,
                        previous.as_deref(),
                    ) {
                        Ok(id) => id,
                        Err(error) => {
                            self.error(error);
                            state.detection = ConversationDetection::Ambiguous;
                            String::new()
                        }
                    }
                } else {
                    conversation
                };
                if state.conversation != conversation || state.view_id != view_id {
                    if let Some((audio, _)) = state.voice_transfer.take() {
                        audio
                            .cancelled
                            .store(true, std::sync::atomic::Ordering::Relaxed);
                        state.requests.remove(&audio.request_id);
                    }
                    state.generation += 1;
                    state.conversation = conversation;
                }
                state.view_id = view_id;
                state.title = if state.conversation.is_empty() {
                    String::new()
                } else {
                    title
                };
                drop(state);
                self.config().await;
                self.status().await;
            }
            PageRequest::Translate(request) => {
                let id = request.request_id.clone();
                let conv = request.conversation.clone();
                {
                    let mut state = self.state.lock().await;
                    if state.cancelled.contains(&id) || !state.requests.insert(id.clone()) {
                        return;
                    }
                }
                if let Err(error) = self.translate(request).await {
                    // Never deliver to a different chat, even when a request failed after a switch.
                    let state = self.state.lock().await;
                    if state.conversation == conv && state.requests.contains(&id) {
                        self.emit_page( json!({"type":"translation_error","request_id":id,"conversation":conv,"message":error.to_string()}));
                    }
                    drop(state);
                    self.status().await;
                    self.config().await;
                }
                self.state.lock().await.requests.remove(&id);
            }
            PageRequest::CancelTranslation {
                request_id,
                conversation,
            } => {
                let mut state = self.state.lock().await;
                if state.conversation == conversation {
                    state.requests.remove(&request_id);
                    state.cancelled.push_back(request_id);
                    while state.cancelled.len() > 128 {
                        state.cancelled.pop_front();
                    }
                }
            }
            PageRequest::EditDraft {
                edit_id,
                ticket,
                conversation,
                view_id,
                source,
                restore,
            } => {
                let state = self.state.lock().await;
                let reply = state.completed_replies.iter().rev().find(|reply| {
                    reply.ticket == ticket
                        && reply.conversation == conversation
                        && reply.view_id == view_id
                        && state.view_id == view_id
                        && state.current(&conversation, reply.generation)
                        && now().saturating_sub(reply.saved_at) < 1800
                        && (restore || reply.source == source)
                });
                if let Some(reply) = reply {
                    // The page supplies no replacement text. Only completed native
                    // translation output (or its original source) can be inserted.
                    self.emit_desktop( json!({"type":"draft_edit","edit_id":edit_id,"ticket":ticket,
                        "conversation":conversation,"view_id":view_id,"revision":state.generation,
                        "source":source,"text":if restore {&reply.source} else {&reply.text},"restore":restore}));
                } else {
                    self.emit_page( json!({"type":"draft_edit_error","edit_id":edit_id,"conversation":conversation,
                        "message":"This preview is no longer current. Preview your draft again."}));
                }
            }
        }
    }
}
