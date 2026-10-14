use crate::{auth::Credentials, storage::Account};
#[cfg(target_os = "macos")]
use anyhow::{Context, ensure};
use anyhow::{Result, bail};

#[cfg(target_os = "macos")]
const CREDENTIAL_SERVICE: &str = "com.wisp.desktop.oauth.v2";
#[cfg(target_os = "macos")]
const LEGACY_CREDENTIAL_SERVICE: &str = "com.wisp.desktop.oauth";

#[cfg(target_os = "macos")]
fn credential_key(account: &Account, host: &str) -> String {
    format!("{}@{}", account.client_id, host)
}

pub fn load_credentials(account: &Account, host: &str) -> Result<Option<Credentials>> {
    #[cfg(target_os = "macos")]
    {
        use security_framework::passwords::get_generic_password;
        let key = credential_key(account, host);
        match get_generic_password(CREDENTIAL_SERVICE, &key) {
            Ok(bytes) => Ok(Some(
                serde_json::from_slice(&bytes).context("Invalid Wisp Keychain record")?,
            )),
            Err(e) if e.code() == -25300 => {
                // Old ad hoc builds bound this item's permission to a build
                // hash. Read it through normal macOS authorization, then create
                // a new item with the signed app's default access control.
                // Never alter an existing ACL or fall back after access denial.
                match get_generic_password(LEGACY_CREDENTIAL_SERVICE, &key) {
                    Ok(bytes) => {
                        let credentials = serde_json::from_slice(&bytes)
                            .context("Invalid Wisp Keychain record")?;
                        save_credentials(account, host, &credentials)?;
                        // Deleting the old item needs separate owner permission
                        // on macOS. Defer cleanup to explicit sign-out rather
                        // than adding another startup authorization prompt.
                        Ok(Some(credentials))
                    }
                    Err(e) if e.code() == -25300 => Ok(None),
                    Err(_) => bail!("Cannot access Wisp credentials in the macOS Keychain"),
                }
            }
            Err(_) => bail!("Cannot access Wisp credentials in the macOS Keychain"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (account, host);
        bail!("Secure sign-in storage is not available on this platform yet")
    }
}

pub fn save_credentials(account: &Account, host: &str, credentials: &Credentials) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::set_generic_password(
            CREDENTIAL_SERVICE,
            &credential_key(account, host),
            &serde_json::to_vec(credentials)?,
        )
        .map_err(|_| anyhow::anyhow!("Cannot save Wisp credentials to macOS Keychain"))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (account, host, credentials);
        bail!("Secure sign-in storage is not available on this platform yet")
    }
}

pub fn delete_credentials(account: &Account, host: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let key = credential_key(account, host);
        let mut failed = false;
        for service in [CREDENTIAL_SERVICE, LEGACY_CREDENTIAL_SERVICE] {
            if let Err(error) =
                security_framework::passwords::delete_generic_password(service, &key)
                && error.code() != -25300
            {
                failed = true;
            }
        }
        ensure!(!failed, "Cannot remove Wisp credentials from Keychain");
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (account, host);
        bail!("Secure sign-in storage is not available on this platform yet")
    }
}

pub const fn available() -> bool {
    cfg!(target_os = "macos")
}
