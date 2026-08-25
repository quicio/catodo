//! Local storage for the pairing token.
//!
//! Strategy: try the OS keyring first (Keychain on mac, Credential Manager
//! on Windows, Secret Service on Linux). If the keyring is unavailable
//! (headless Linux, missing D-Bus) we fall back to a file at
//! `~/.config/catodo/tray-token` with mode 0600.

use std::fs;
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;

use anyhow::{Context, Result};

const SERVICE: &str = "catodo-tray";
const ACCOUNT: &str = "backend-token";

fn fallback_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join(".config").join("catodo").join("tray-token"))
}

/// Read the persisted token, if any. Returns Ok(None) if nothing is stored.
pub fn read_token() -> Result<Option<String>> {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        match entry.get_password() {
            Ok(pw) if !pw.is_empty() => return Ok(Some(pw)),
            Ok(_) => {}
            Err(keyring::Error::NoEntry) => {}
            // Fall through to file fallback if the platform keyring fails for
            // any other reason (missing daemon, headless, etc.).
            Err(_) => {}
        }
    }
    if let Some(path) = fallback_path() {
        if path.is_file() {
            let s = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
            let trimmed = s.trim().to_string();
            if !trimmed.is_empty() {
                return Ok(Some(trimmed));
            }
        }
    }
    Ok(None)
}

/// Persist the token. Best-effort: keyring first, file fallback.
pub fn write_token(token: &str) -> Result<()> {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        if entry.set_password(token).is_ok() {
            // Clear any stale fallback file so we don't have two sources of truth.
            if let Some(p) = fallback_path() {
                let _ = fs::remove_file(p);
            }
            return Ok(());
        }
    }
    let path = fallback_path().context("HOME not set and keyring unavailable")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)
        .with_context(|| format!("open {}", path.display()))?;
    f.write_all(token.as_bytes())?;
    Ok(())
}

/// Forget any stored token (used by the "Re-pair" menu action).
pub fn clear_token() -> Result<()> {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.delete_credential();
    }
    if let Some(p) = fallback_path() {
        if p.is_file() {
            let _ = fs::remove_file(p);
        }
    }
    Ok(())
}