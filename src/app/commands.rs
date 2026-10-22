use super::*;

impl Engine {
    pub async fn native(self: Arc<Self>, payload: String) {
        if let Err(error) = self.native_inner(&payload).await {
            self.error(error);
        }
        self.status().await;
        self.config().await;
    }
    pub(super) async fn native_inner(&self, payload: &str) -> Result<()> {
        let command = parse_native(payload)?;
        // Serialize account/catalog changes while allowing chat disablement and
        // rules edits during the browser consent flow. Reject duplicate clicks.
        let _account_operation = if matches!(
            command,
            NativeCommand::RefreshModels
                | NativeCommand::SignIn { .. }
                | NativeCommand::SignOut
                | NativeCommand::Account { .. }
        ) {
            Some(
                self.account_operations
                    .try_lock()
                    .context("An account operation is already in progress")?,
            )
        } else {
            None
        };
        match command {
            NativeCommand::Status => {}
            NativeCommand::RepairChat {
                view_id,
                sequence,
                message_ids,
            } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.can_repair_chat
                        && state.view_id == view_id
                        && state.active_sequence == sequence
                        && state.message_ids == message_ids,
                    "The chat changed. Open its repair options again"
                );
                let peer = state.peer.clone();
                let conversation = state.storage.repair_chat(&peer, &message_ids, None)?;
                state.generation += 1;
                state.requests.clear();
                state.completed_replies.clear();
                state.conversation = conversation;
                state.can_repair_chat = false;
                state.detection = ConversationDetection::Ready;
                self.emit_desktop(json!({"type":"notice","kind":"success","message":"Chat reconnected. Your saved translations are still available."}));
            }
            NativeCommand::DownloadSpeechModel => {
                let ready = self.speech.status().ready;
                self.enable_voice(true).await?;
                if ready {
                    self.download_speech().await?;
                }
            }
            NativeCommand::VoiceEnabled { enabled } => self.enable_voice(enabled).await?,
            NativeCommand::VoiceAuto { enabled } => {
                let mut state = self.state.lock().await;
                state.storage.settings.voice_auto = Some(enabled);
                state.storage.save()?;
            }
            NativeCommand::VoiceMaxMinutes { minutes } => {
                let mut state = self.state.lock().await;
                state.storage.settings.voice_max_minutes = Some(minutes);
                state.storage.save()?;
            }
            NativeCommand::RefreshModels => {
                ensure!(
                    self.auth.lock().await.eligible(),
                    "Connect ChatGPT to check available models"
                );
                self.refresh_models().await?;
            }
            NativeCommand::SignIn { new_account } => {
                ensure!(
                    crate::platform::credentials::available(),
                    "Secure sign-in storage is not available on this platform yet"
                );
                self.emit_desktop(json!({"type":"auth_busy","busy":true}));
                self.pause_translation().await;
                let result = self
                    .auth
                    .lock()
                    .await
                    .sign_in(new_account, |url| {
                        self.emit_desktop(json!({"type":"open_auth","url":url}))
                    })
                    .await;
                self.emit_desktop(json!({"type":"auth_busy","busy":false}));
                let account = result?;
                let eligible = self.auth.lock().await.eligible();
                let mut state = self.state.lock().await;
                state.generation += 1;
                state.models.clear();
                state.translation_ready = false;
                state.storage.settings.model = None;
                state.storage.settings.active_account = Some(account.client_id.clone());
                if !state
                    .storage
                    .settings
                    .accounts
                    .iter()
                    .any(|a| a.client_id == account.client_id)
                {
                    state.storage.settings.accounts.push(account);
                }
                let welcome = eligible && !state.storage.settings.welcomed;
                state.storage.settings.welcomed |= eligible;
                state.storage.save()?;
                drop(state);
                if welcome {
                    self.emit_desktop(json!({"type":"welcome"}));
                }
                if eligible {
                    self.refresh_models().await?;
                } else {
                    bail!(
                        "Signed in, but ChatGPT plan usage was not authorized. Continue with ChatGPT to enable it"
                    );
                }
            }
            NativeCommand::SignOut => {
                self.pause_translation().await;
                let revoked = self.auth.lock().await.sign_out().await?;
                if !revoked {
                    self.error("Signed out locally. Remote revocation was not confirmed; disconnect Wisp in ChatGPT settings");
                }
            }
            NativeCommand::Account { client_id } => {
                let id = client_id.as_str();
                let account = self
                    .state
                    .lock()
                    .await
                    .storage
                    .settings
                    .accounts
                    .iter()
                    .find(|a| a.client_id == id)
                    .cloned()
                    .context("Unknown account")?;
                self.pause_translation().await;
                self.auth.lock().await.switch(account)?;
                let mut state = self.state.lock().await;
                state.generation += 1;
                state.models.clear();
                state.translation_ready = false;
                state.storage.settings.model = None;
                state.storage.settings.active_account = Some(id.to_owned());
                state.storage.save()?;
                drop(state);
                if self.auth.lock().await.eligible() {
                    self.refresh_models().await?;
                }
            }
            NativeCommand::Enable { view_id, enabled } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.view_id.is_empty() || view_id == state.view_id,
                    "The conversation changed. Try the switch again"
                );
                ensure!(
                    !state.conversation.is_empty(),
                    "Open a supported WhatsApp conversation first"
                );
                let conversation = state.conversation.clone();
                state.generation += 1;
                state.storage.set_enabled(&conversation, enabled)?;
                drop(state);
                self.config().await;
            }
            NativeCommand::Model { slug } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.translation_ready && !state.models_busy,
                    "Wait for available models to finish loading"
                );
                let model = slug.as_str();
                ensure!(
                    state.models.iter().any(|m| m.slug == model),
                    "Model is not in the available ChatGPT catalog"
                );
                state.generation += 1;
                state.storage.settings.model = Some(model.to_owned());
                state.storage.save()?;
            }
            NativeCommand::Rules { view_id, rules } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.view_id == view_id && !state.conversation.is_empty(),
                    "The conversation changed. Reopen its chat options"
                );
                let conversation = state.conversation.clone();
                state.storage.set_rules(&conversation, &rules)?;
                state.generation += 1;
                self.emit_desktop( json!({"type":"notice","kind":"success","message":"Chat rules saved","view_id":view_id}));
            }
            NativeCommand::Reasoning { slug, effort } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.translation_ready
                        && !state.models_busy
                        && state.storage.settings.model.as_ref() == Some(&slug),
                    "The model changed. Choose its thinking level again"
                );
                ensure!(
                    state.models.iter().any(|model| model.slug == slug),
                    "Model is not in the available ChatGPT catalog"
                );
                ensure!(
                    effort
                        .is_none_or(|effort| crate::model_options::reasoning_options(&slug)
                            .contains(&effort)),
                    "This thinking level is not supported by the selected model"
                );
                state.storage.set_reasoning(slug, effort)?;
                state.generation += 1;
                self.emit_desktop(
                    json!({"type":"notice","kind":"success","message":"Thinking level saved"}),
                );
            }
            NativeCommand::ClearCache => {
                let mut state = self.state.lock().await;
                state.storage.clear_cache()?;
                state.generation += 1;
                self.emit_desktop( json!({"type":"notice","kind":"success","message":"Saved translations cleared"}));
            }
            NativeCommand::ClearChatCache { view_id } => {
                let mut state = self.state.lock().await;
                ensure!(
                    state.view_id == view_id && !state.conversation.is_empty(),
                    "The chat changed. Open its options again"
                );
                let conversation = state.conversation.clone();
                state.storage.clear_chat_cache(&conversation)?;
                state.generation += 1;
                self.emit_desktop(json!({"type":"notice","kind":"success","message":"This chat’s saved translations cleared"}));
            }
            NativeCommand::TranslationPreferences { preferences } => {
                let mut state = self.state.lock().await;
                state.storage.set_translation_preferences(preferences)?;
                state.generation += 1;
                self.emit_desktop(json!({"type":"notice","kind":"success","message":"Translation defaults saved","translation_preferences_saved":true}));
            }
            NativeCommand::AddLanguage { name, region } => {
                self.state
                    .lock()
                    .await
                    .storage
                    .add_language(crate::preferences::CustomLanguage { name, region })?;
                self.emit_desktop(
                    json!({"type":"notice","kind":"success","message":"Language added"}),
                );
            }
            NativeCommand::ViewPreferences { preferences } => {
                self.state
                    .lock()
                    .await
                    .storage
                    .set_view_preferences(preferences)?;
            }
        }
        Ok(())
    }
}
