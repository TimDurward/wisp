use super::*;

impl Engine {
    pub(super) async fn translate(&self, request: TranslationRequest) -> Result<()> {
        let (generation, options, rules, preferences, epoch) = {
            let mut state = self.state.lock().await;
            ensure!(
                state.conversation == request.conversation
                    && state.storage.enabled(&request.conversation),
                "Translation is disabled for this conversation"
            );
            ensure!(
                request.purpose != TranslationPurpose::Reading
                    || request.direction != Direction::Outgoing
                    || state.storage.settings.view_preferences.include_sent,
                "Reading translation is disabled for sent messages"
            );
            if translation::links::only_links(&request.text) {
                let generation = state.generation;
                if state.valid_request(&request, generation) {
                    state.remember_reply(&request, &request.text, generation);
                    self.emit_page(json!({"type":"translation","request_id":request.request_id,"conversation":request.conversation,"text":request.text,"cached":false}));
                }
                return Ok(());
            }
            if request.purpose == TranslationPurpose::Reading {
                let key = translation::history_key(
                    &request.conversation,
                    &request.message_id,
                    request.direction,
                    &request.text,
                    &state.storage.settings.translation_preferences,
                );
                if let Some(text) = state.storage.saved_message(&key, &request.conversation) {
                    if state.requests.contains(&request.request_id) {
                        self.emit_page(json!({"type":"translation","request_id":request.request_id,"conversation":request.conversation,"text":text,"cached":true}));
                    }
                    return Ok(());
                }
            }
            ensure!(
                state.translation_ready,
                "Connect ChatGPT and choose an available model first"
            );
            let model = state
                .storage
                .settings
                .model
                .clone()
                .context("Sign in with ChatGPT to discover an eligible translation model")?;
            let reasoning = state.storage.settings.model_reasoning.get(&model).copied();
            (
                state.generation,
                inference::Options::new(model, reasoning),
                state.storage.preferences(&request.conversation).rules,
                state.storage.settings.translation_preferences.clone(),
                state.storage.preferences(&request.conversation).cache_epoch,
            )
        };
        let (token, account) = {
            let mut auth = self.auth.lock().await;
            let token = auth.access_token().await?;
            (
                token,
                auth.account
                    .as_ref()
                    .context("No ChatGPT account")?
                    .client_id
                    .clone(),
            )
        };
        let key = translation::cache_key(
            &account,
            &options.cache_model(),
            &request,
            &rules,
            &preferences,
            epoch,
        );
        let history_key = translation::history_key(
            &request.conversation,
            &request.message_id,
            request.direction,
            &request.text,
            &preferences,
        );
        let cached = self.state.lock().await.storage.cached(&key);
        if let Some(text) = cached {
            let mut state = self.state.lock().await;
            if state.valid_request(&request, generation) {
                state.remember_reply(&request, &text, generation);
                if request.purpose == TranslationPurpose::Reading
                    && state
                        .storage
                        .save_message(history_key, &request.conversation, text.clone())
                        .is_err()
                {
                    self.error(
                        "Could not save this message translation. Check disk space and permissions",
                    );
                }
                self.emit_page( json!({"type":"translation","request_id":request.request_id,"conversation":request.conversation,"text":text,"cached":true}));
            }
            drop(state);
            self.status().await;
            return Ok(());
        }
        // Draft progress is read-only; only completed output can be prepared or cached.
        if !self.valid_request(&request, generation).await {
            return Ok(());
        }
        // Reserve an independent slot for replies so historical messages cannot
        // make a live draft wait behind a long reading translation.
        let permits = if request.purpose == TranslationPurpose::Reply {
            &self.reply_permits
        } else {
            &self.reading_permits
        };
        let cancel = async {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                if !self.valid_request(&request, generation).await {
                    return;
                }
            }
        };
        tokio::pin!(cancel);
        let permit = tokio::select! {
            permit = permits.acquire() => permit?,
            _ = &mut cancel => return Ok(()),
        };
        {
            let mut state = self.state.lock().await;
            if !state.valid_request(&request, generation) {
                return Ok(());
            }
            let recent = if request.purpose == TranslationPurpose::Reply {
                &mut state.recent_replies
            } else {
                &mut state.recent_reading
            };
            while recent
                .front()
                .is_some_and(|t| now().saturating_sub(*t) >= 60)
            {
                recent.pop_front();
            }
            ensure!(
                recent.len() < 30,
                "Translation request limit reached. Try again in a minute"
            );
            recent.push_back(now());
        }
        let on_delta = |text: &str| {
            if request.purpose != TranslationPurpose::Reply {
                return;
            }
            if let Ok(state) = self.state.try_lock()
                && state.valid_request(&request, generation)
            {
                self.emit_page( json!({"type":"translation_progress","request_id":request.request_id,"conversation":request.conversation,"text":text}));
            }
        };
        let text = tokio::select! {
            result = inference::translate(&self.client, &token, &options, &request, &rules, &preferences, on_delta) => result?,
            _ = &mut cancel => return Ok(()),
        };
        let mut state = self.state.lock().await;
        if state.valid_request(&request, generation) {
            state.remember_reply(&request, &text, generation);
            let saved = if request.purpose == TranslationPurpose::Reading {
                state
                    .storage
                    .save_message(history_key, &request.conversation, text.clone())
            } else {
                state
                    .storage
                    .cache_for_chat(key, text.clone(), &request.conversation)
            };
            if saved.is_err() {
                self.error("Translation completed, but Wisp could not save it locally. Check available disk space and permissions");
            }
            self.emit_page( json!({"type":"translation","request_id":request.request_id,"conversation":request.conversation,"text":text,"cached":false}));
        }
        drop(state);
        drop(permit);
        self.status().await;
        Ok(())
    }
    pub(super) async fn valid_request(
        &self,
        request: &TranslationRequest,
        generation: u64,
    ) -> bool {
        self.state.lock().await.valid_request(request, generation)
    }

    #[cfg(test)]
    pub(super) async fn valid_generation(&self, conversation: &str, generation: u64) -> bool {
        self.state.lock().await.current(conversation, generation)
    }
}
