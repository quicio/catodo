//! Platform detection and data-directory resolution.
//!
//! This crate has no HTTP dependency; it only knows about the host OS and the
//! user data paths shared with the Python backend.

use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Linux,
    Macos,
    Other,
}

impl Os {
    pub fn current() -> Self {
        match env::consts::OS {
            "linux" => Self::Linux,
            "macos" => Self::Macos,
            _ => Self::Other,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Arch {
    X86_64,
    Aarch64,
    Other,
}

impl Arch {
    pub fn current() -> Self {
        match env::consts::ARCH {
            "x86_64" => Self::X86_64,
            "aarch64" => Self::Aarch64,
            _ => Self::Other,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlatformInfo {
    pub os: Os,
    pub arch: Arch,
}

impl PlatformInfo {
    pub fn detect() -> Self {
        Self {
            os: Os::current(),
            arch: Arch::current(),
        }
    }
}

/// Resolves the data directory using the same precedence as the Python backend:
/// `CATODO_DATA_DIR`, then `$HOME/.local/share/catodo`.
pub fn data_dir_from(env_var: Option<&str>, home: Option<&str>) -> PathBuf {
    if let Some(value) = env_var.filter(|value| !value.trim().is_empty()) {
        return PathBuf::from(value);
    }
    if let Some(home) = home.filter(|value| !value.trim().is_empty()) {
        return PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("catodo");
    }
    PathBuf::from(".local").join("share").join("catodo")
}

pub fn data_dir() -> PathBuf {
    let env_var = env::var("CATODO_DATA_DIR").ok();
    let home = env::var("HOME").ok();
    data_dir_from(env_var.as_deref(), home.as_deref())
}

/// Resolves the bundled plugin repository used by the Python backend.
///
/// Order: `CATODO_PLUGINS_REPO`, `CATODO_REPO_ROOT/plugins-repo`, then the
/// repository-relative path compiled into the crate (useful for `cargo run`).
pub fn static_dir() -> PathBuf {
    if let Ok(value) = env::var("CATODO_STATIC_DIR") {
        if !value.trim().is_empty() {
            return PathBuf::from(value);
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("static");
            if candidate.is_dir() {
                return candidate;
            }
        }
    }
    if let Ok(value) = env::var("CATODO_REPO_ROOT") {
        if !value.trim().is_empty() {
            return PathBuf::from(value).join("backend").join("static");
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("backend")
        .join("static")
}

pub fn plugins_repo() -> PathBuf {
    if let Ok(value) = env::var("CATODO_PLUGINS_REPO") {
        if !value.trim().is_empty() {
            return PathBuf::from(value);
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("plugins-repo");
            if candidate.is_dir() {
                return candidate;
            }
        }
    }
    if let Ok(value) = env::var("CATODO_REPO_ROOT") {
        if !value.trim().is_empty() {
            return PathBuf::from(value).join("plugins-repo");
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("plugins-repo")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_env_override_wins() {
        assert_eq!(
            data_dir_from(Some("/tmp/catodo"), Some("/home/hugo")),
            PathBuf::from("/tmp/catodo")
        );
    }

    #[test]
    fn data_dir_uses_home_by_default() {
        assert_eq!(
            data_dir_from(None, Some("/home/hugo")),
            PathBuf::from("/home/hugo/.local/share/catodo")
        );
    }

    #[test]
    fn empty_env_override_falls_back_to_home() {
        assert_eq!(
            data_dir_from(Some("   "), Some("/home/hugo")),
            PathBuf::from("/home/hugo/.local/share/catodo")
        );
    }

    #[test]
    fn detect_reports_current_platform() {
        let info = PlatformInfo::detect();
        assert_eq!(info.os, Os::current());
        assert_eq!(info.arch, Arch::current());
    }
}
