use super::LoadedSecret;
use crate::storage::{hash, persistence::private_write};
use anyhow::{Context, Result, ensure};
use std::{
    fs,
    path::{Path, PathBuf},
    ptr,
};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
    },
};

pub struct Store {
    directory: PathBuf,
}

impl Store {
    pub fn new(root: &Path) -> Self {
        Self {
            directory: root.join("credentials"),
        }
    }

    fn path(&self, key: &str) -> PathBuf {
        self.directory.join(format!("{}.dpapi", hash(key)))
    }

    pub fn load(&self, key: &str) -> Result<Option<LoadedSecret>> {
        let encrypted = match fs::read(self.path(key)) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => anyhow::bail!("Cannot read Wisp secure sign-in record"),
        };
        Ok(Some(LoadedSecret {
            data: crypt(&encrypted, key, false)?,
            migrate: false,
        }))
    }

    pub fn save(&self, key: &str, data: &[u8]) -> Result<()> {
        // Protect before creating any file. DPAPI uses the current Windows
        // user's keys; no machine-wide or plaintext fallback is permitted.
        let encrypted = crypt(data, key, true)?;
        fs::create_dir_all(&self.directory).context("Cannot create Wisp credential directory")?;
        private_write(&self.path(key), &encrypted).context("Cannot save Wisp secure sign-in record")
    }

    pub fn delete(&self, key: &str) -> Result<()> {
        match fs::remove_file(self.path(key)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => anyhow::bail!("Cannot remove Wisp secure sign-in record"),
        }
    }
}

fn crypt(data: &[u8], key: &str, protect: bool) -> Result<Vec<u8>> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: data
            .len()
            .try_into()
            .context("Sign-in record is too large")?,
        pbData: data.as_ptr().cast_mut(),
    };
    // Bind the encrypted record to its account/profile identity as well as
    // the Windows user. Copying a file between accounts must not decrypt it.
    let entropy = format!("com.wisp.desktop.oauth.v1:{key}");
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: entropy.len().try_into()?,
        pbData: entropy.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // SAFETY: input and entropy are live immutable byte slices for the entire
    // call. DPAPI does not modify them and allocates output with LocalAlloc.
    let success = unsafe {
        if protect {
            CryptProtectData(
                &input,
                ptr::null(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    ensure!(
        success != 0,
        "Windows could not protect or unlock Wisp sign-in"
    );
    // SAFETY: a successful call returns cbData readable bytes in pbData.
    // Empty output needs no slice: Rust still requires a non-null pointer for
    // an empty slice. Release non-null OS allocations once with LocalFree.
    let result = unsafe {
        let bytes = if output.cbData == 0 {
            Vec::new()
        } else {
            std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
        };
        if !output.pbData.is_null() {
            // Clear the OS allocation, which contains plaintext after unprotect.
            for byte in std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize) {
                std::ptr::write_volatile(byte, 0);
            }
            LocalFree(output.pbData.cast());
        }
        bytes
    };
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{auth::Credentials, platform::credentials::CredentialStore, storage::Account};

    #[test]
    fn encrypted_credentials_survive_restart_refresh_and_sign_out() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("perfil español 日本語");
        let store = CredentialStore::new(&root);
        let account = Account {
            client_id: "test-client".into(),
            ..Default::default()
        };
        // OAuth records can exceed Credential Manager's 2560-byte blob limit.
        let mut credentials = Credentials {
            access_token: "dummy-access-token".repeat(1000),
            refresh_token: Some("dummy-refresh-token".into()),
            id_token: "dummy-id-token".into(),
            scopes: vec!["resource.invoke".into()],
            expires_at: 1234,
        };
        assert!(store.load(&account, "profile").unwrap().is_none());
        store.save(&account, "profile", &credentials).unwrap();
        let bytes = fs::read(Store::new(&root).path("test-client@profile")).unwrap();
        assert!(!bytes.windows(18).any(|w| w == b"dummy-access-token"));
        let reopened = CredentialStore::new(&root);
        assert_eq!(
            reopened
                .load(&account, "profile")
                .unwrap()
                .unwrap()
                .access_token,
            credentials.access_token
        );
        credentials.access_token = "refreshed-token".into();
        reopened.save(&account, "profile", &credentials).unwrap();
        assert_eq!(
            store
                .load(&account, "profile")
                .unwrap()
                .unwrap()
                .access_token,
            "refreshed-token"
        );
        assert!(store.load(&account, "other-profile").unwrap().is_none());
        store.delete(&account, "profile").unwrap();
        store.delete(&account, "profile").unwrap();
        assert!(reopened.load(&account, "profile").unwrap().is_none());
        assert_eq!(fs::read_dir(root.join("credentials")).unwrap().count(), 0);
    }

    #[test]
    fn damaged_or_swapped_records_fail_closed() {
        let directory = tempfile::tempdir().unwrap();
        let store = Store::new(directory.path());
        store.save("account@profile", b"synthetic secret").unwrap();
        fs::copy(store.path("account@profile"), store.path("other@profile")).unwrap();
        assert!(store.load("other@profile").is_err());
        let path = store.path("account@profile");
        let mut bytes = fs::read(&path).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        fs::write(&path, bytes).unwrap();
        assert!(store.load("account@profile").is_err());
        store.save("account@profile", b"").unwrap();
        assert!(
            store
                .load("account@profile")
                .unwrap()
                .unwrap()
                .data
                .is_empty()
        );
        fs::write(&path, b"plaintext is never accepted").unwrap();
        assert!(store.load("account@profile").is_err());
    }
}
