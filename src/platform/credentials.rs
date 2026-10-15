use crate::{auth::Credentials, storage::Account};
use anyhow::{Context, Result};
use std::path::Path;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
use macos as backend;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use unsupported as backend;
#[cfg(target_os = "windows")]
use windows as backend;

pub(super) struct LoadedSecret {
    data: Vec<u8>,
    migrate: bool,
}

pub struct CredentialStore(backend::Store);

impl CredentialStore {
    pub fn new(root: &Path) -> Self {
        Self(backend::Store::new(root))
    }

    pub fn load(&self, account: &Account, host: &str) -> Result<Option<Credentials>> {
        let key = credential_key(account, host);
        let Some(secret) = self.0.load(&key)? else {
            return Ok(None);
        };
        let credentials =
            serde_json::from_slice(&secret.data).context("Invalid Wisp secure sign-in record")?;
        if secret.migrate {
            self.save(account, host, &credentials)?;
        }
        Ok(Some(credentials))
    }

    pub fn save(&self, account: &Account, host: &str, credentials: &Credentials) -> Result<()> {
        self.0.save(
            &credential_key(account, host),
            &serde_json::to_vec(credentials)?,
        )
    }

    pub fn delete(&self, account: &Account, host: &str) -> Result<()> {
        self.0.delete(&credential_key(account, host))
    }
}

fn credential_key(account: &Account, host: &str) -> String {
    format!("{}@{}", account.client_id, host)
}

pub const fn available() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}
