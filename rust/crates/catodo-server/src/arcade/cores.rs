//! Resolución y descarga on-demand de cores libretro.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Context};

use crate::config::RuntimeConfig;

const BUILDBOT: &str = "https://buildbot.libretro.com/nightly";

/// Core que corresponde a un sistema (por nombre de carpeta del usuario).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreSpec {
    pub system: &'static str,
    pub core: &'static str,
}

const SYSTEMS: &[CoreSpec] = &[
    CoreSpec {
        system: "nes",
        core: "fceumm",
    },
    CoreSpec {
        system: "snes",
        core: "snes9x",
    },
    CoreSpec {
        system: "gb",
        core: "gambatte",
    },
    CoreSpec {
        system: "gbc",
        core: "gambatte",
    },
    CoreSpec {
        system: "gba",
        core: "mgba",
    },
    CoreSpec {
        system: "n64",
        core: "mupen64plus_next",
    },
    CoreSpec {
        system: "psx",
        core: "pcsx_rearmed",
    },
    CoreSpec {
        system: "genesis",
        core: "genesis_plus_gx",
    },
];

/// Normaliza el nombre de carpeta a un sistema conocido.
pub fn normalize_system(name: &str) -> Option<&'static str> {
    let key: String = name
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let system = match key.as_str() {
        "nes" | "famicom" => "nes",
        "snes" | "supernintendo" => "snes",
        "gb" | "gameboy" => "gb",
        "gbc" | "gameboycolor" => "gbc",
        "gba" | "gameboyadvance" => "gba",
        "n64" | "nintendo64" => "n64",
        "psx" | "ps1" | "playstation" => "psx",
        "genesis" | "megadrive" | "md" => "genesis",
        _ => return None,
    };
    Some(system)
}

pub fn core_for_system(system: &str) -> Option<&'static CoreSpec> {
    let normalized = normalize_system(system)?;
    SYSTEMS.iter().find(|spec| spec.system == normalized)
}

fn platform_segment() -> anyhow::Result<&'static str> {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            Ok("apple/osx/arm64")
        } else {
            Ok("apple/osx/x86_64")
        }
    } else if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") {
            Ok("linux/arm64")
        } else {
            Ok("linux/x86_64")
        }
    } else {
        Err(anyhow!(
            "no hay cores libretro para esta plataforma (sólo macOS y Linux)"
        ))
    }
}

fn library_extension() -> &'static str {
    if cfg!(target_os = "macos") {
        "dylib"
    } else {
        "so"
    }
}

/// Nombre del archivo de la librería para un core.
pub fn core_filename(core: &str) -> String {
    format!("{core}_libretro.{}", library_extension())
}

pub async fn cores_dir(config: &RuntimeConfig) -> PathBuf {
    let configured = config.get_string("arcade_cores_dir").await;
    let base = configured
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            format!(
                "{}/.local/share/catodo/cores",
                std::env::var("HOME").unwrap_or_default()
            )
        });
    PathBuf::from(base)
}

/// Devuelve la ruta del core para `system`, descargándolo si falta.
pub async fn ensure_core(
    config: &RuntimeConfig,
    system: &str,
) -> anyhow::Result<(PathBuf, CoreSpec)> {
    let spec = core_for_system(system)
        .ok_or_else(|| anyhow!("no hay core libretro configurado para «{system}»"))?
        .clone();
    let dir = cores_dir(config).await;
    tokio::fs::create_dir_all(&dir).await.ok();
    let target = dir.join(core_filename(spec.core));
    if target.is_file() {
        return Ok((target, spec));
    }

    let platform = platform_segment()?;
    let url = format!(
        "{BUILDBOT}/{platform}/latest/{core}_libretro.{ext}.zip",
        core = spec.core,
        ext = library_extension()
    );
    tracing::info!(%url, "arcade: descargando core");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()?;
    let response = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("no se pudo descargar el core {url}"))?
        .error_for_status()?;
    let bytes = response.bytes().await?;

    let zip_path = dir.join(format!("{}.zip", spec.core));
    tokio::fs::write(&zip_path, &bytes).await?;
    let status = tokio::process::Command::new("unzip")
        .args(["-o", "-q"])
        .arg(&zip_path)
        .arg("-d")
        .arg(&dir)
        .status()
        .await
        .context("no se pudo ejecutar unzip")?;
    let _ = tokio::fs::remove_file(&zip_path).await;
    if !status.success() {
        return Err(anyhow!("unzip falló al extraer el core {}", spec.core));
    }
    if !target.is_file() {
        return Err(anyhow!(
            "el core {} no quedó en {}",
            spec.core,
            target.display()
        ));
    }
    Ok((target, spec))
}

/// Directorio de savestates: junto a la ROM.
pub fn state_path(rom: &Path, slot: u32) -> PathBuf {
    let name = rom
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "game".to_string());
    let parent = rom.parent().unwrap_or_else(|| Path::new("."));
    parent.join(format!("{name}.state{slot}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_system_folders() {
        assert_eq!(core_for_system("NES").unwrap().core, "fceumm");
        assert_eq!(core_for_system("Super Nintendo").unwrap().core, "snes9x");
        assert_eq!(core_for_system("Game Boy").unwrap().core, "gambatte");
        assert_eq!(
            core_for_system("Mega Drive").unwrap().core,
            "genesis_plus_gx"
        );
        assert_eq!(core_for_system("PSX").unwrap().core, "pcsx_rearmed");
        assert!(core_for_system("Dreamcast").is_none());
    }

    #[test]
    fn library_filename_has_platform_extension() {
        let name = core_filename("fceumm");
        if cfg!(target_os = "macos") {
            assert_eq!(name, "fceumm_libretro.dylib");
        } else {
            assert_eq!(name, "fceumm_libretro.so");
        }
    }

    #[test]
    fn state_path_sits_next_to_the_rom() {
        let path = state_path(Path::new("/tmp/juego/pacman.nes"), 2);
        assert_eq!(path, PathBuf::from("/tmp/juego/pacman.state2"));
    }
}
