use super::*;

impl Engine {
    pub async fn startup(&self) {
        let _account_operation = self.account_operations.lock().await;
        self.status().await;
        let eligible = self.auth.lock().await.eligible();
        if eligible && let Err(error) = self.refresh_models().await {
            self.error(error);
        }
        self.config().await;
        self.status().await;
    }
    pub(super) async fn pause_translation(&self) {
        let mut state = self.state.lock().await;
        state.generation += 1;
        state.models.clear();
        state.translation_ready = false;
        drop(state);
        self.config().await;
        self.status().await;
    }
    pub(super) async fn refresh_models(&self) -> Result<()> {
        {
            let mut state = self.state.lock().await;
            state.models_busy = true;
            state.translation_ready = false;
            state.generation += 1;
        }
        self.config().await;
        self.status().await;
        let result = async {
            let token = self.auth.lock().await.access_token().await?;
            let catalog = inference::models(&self.client, &token).await?;
            let mut state = self.state.lock().await;
            if !catalog
                .iter()
                .any(|m| Some(&m.slug) == state.storage.settings.model.as_ref())
            {
                state.storage.settings.model = catalog.first().map(|m| m.slug.clone());
            }
            state.models = catalog;
            state.storage.save()?;
            Ok::<_, anyhow::Error>(())
        }
        .await;
        let mut state = self.state.lock().await;
        state.models_busy = false;
        state.translation_ready = result.is_ok();
        drop(state);
        result
    }
}
