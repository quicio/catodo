//! System volume adapters (macOS AppleScript, Linux PipeWire/PulseAudio).

use std::time::Duration;

use tokio::process::Command;

async fn output(command: &mut Command) -> Option<String> {
    let result = tokio::time::timeout(Duration::from_secs(3), command.output())
        .await
        .ok()?
        .ok()?;
    if !result.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&result.stdout).trim().to_string())
}

#[cfg(target_os = "macos")]
pub async fn get_volume() -> Option<u8> {
    let value =
        output(Command::new("osascript").args(["-e", "output volume of (get volume settings)"]))
            .await?;
    value.trim().parse::<u8>().ok()
}

#[cfg(target_os = "macos")]
pub async fn set_volume(level: u8) -> bool {
    output(Command::new("osascript").args([
        "-e",
        &format!("set volume output volume {}", level.min(100)),
    ]))
    .await
    .is_some()
}

#[cfg(target_os = "macos")]
pub async fn set_default_sink(_sink: &str) -> bool {
    false
}

#[cfg(target_os = "linux")]
pub async fn get_volume() -> Option<u8> {
    if let Some(value) =
        output(Command::new("wpctl").args(["get-volume", "@DEFAULT_AUDIO_SINK@"])).await
    {
        // "Volume: 0.63" or "Volume: 0.63 [MUTED]"
        if let Some(raw) = value.split_whitespace().nth(1) {
            if let Ok(level) = raw.parse::<f64>() {
                return Some((level * 100.0).round().clamp(0.0, 100.0) as u8);
            }
        }
    }
    if let Some(value) =
        output(Command::new("pactl").args(["get-sink-volume", "@DEFAULT_SINK@"])).await
    {
        if let Some(percent) = value
            .split('%')
            .next()
            .and_then(|part| part.split_whitespace().last())
        {
            if let Ok(level) = percent.parse::<u8>() {
                return Some(level.min(100));
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
pub async fn set_volume(level: u8) -> bool {
    let level = level.min(100);
    if output(Command::new("wpctl").args([
        "set-volume",
        "@DEFAULT_AUDIO_SINK@",
        &format!("{level}%"),
    ]))
    .await
    .is_some()
    {
        return true;
    }
    output(Command::new("pactl").args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{level}%")]))
        .await
        .is_some()
}

#[cfg(target_os = "linux")]
pub async fn set_default_sink(sink: &str) -> bool {
    output(Command::new("wpctl").args(["set-default", sink]))
        .await
        .is_some()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub async fn get_volume() -> Option<u8> {
    None
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub async fn set_volume(_level: u8) -> bool {
    false
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub async fn set_default_sink(_sink: &str) -> bool {
    false
}
