use super::LoadedSecret;
use anyhow::{Result, bail};
use std::path::Path;

pub struct Store;

impl Store {
    pub fn new(_root: &Path) -> Self {
        Self
    }

    pub fn load(&self, _key: &str) -> Result<Option<LoadedSecret>> {
        bail!("Secure sign-in storage is not available on this platform yet")
    }

    pub fn save(&self, _key: &str, _data: &[u8]) -> Result<()> {
        bail!("Secure sign-in storage is not available on this platform yet")
    }

    pub fn delete(&self, _key: &str) -> Result<()> {
        bail!("Secure sign-in storage is not available on this platform yet")
    }
}
