use super::LoadedSecret;
use anyhow::{Result, bail, ensure};
use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};
use std::path::Path;

const SERVICE: &str = "com.wisp.desktop.oauth.v2";
const LEGACY_SERVICE: &str = "com.wisp.desktop.oauth";

pub struct Store;

impl Store {
    pub fn new(_root: &Path) -> Self {
        Self
    }

    pub fn load(&self, key: &str) -> Result<Option<LoadedSecret>> {
        for (service, migrate) in [(SERVICE, false), (LEGACY_SERVICE, true)] {
            match get_generic_password(service, key) {
                Ok(data) => return Ok(Some(LoadedSecret { data, migrate })),
                Err(error) if error.code() == -25300 => continue,
                // Never fall back after an access denial or change item ACLs.
                Err(_) => bail!("Cannot access Wisp credentials in the macOS Keychain"),
            }
        }
        Ok(None)
    }

    pub fn save(&self, key: &str, data: &[u8]) -> Result<()> {
        set_generic_password(SERVICE, key, data)
            .map_err(|_| anyhow::anyhow!("Cannot save Wisp credentials to macOS Keychain"))
        // Legacy items are only removed on explicit sign-out: deletion needs
        // separate owner permission and must not add a startup prompt.
    }

    pub fn delete(&self, key: &str) -> Result<()> {
        let mut failed = false;
        for service in [SERVICE, LEGACY_SERVICE] {
            if let Err(error) = delete_generic_password(service, key)
                && error.code() != -25300
            {
                failed = true;
            }
        }
        ensure!(!failed, "Cannot remove Wisp credentials from Keychain");
        Ok(())
    }
}
