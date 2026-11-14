//! Encode del core a fMP4: video y audio en dos pipelines independientes.
//!
//! Cada uno es un ffmpeg con un único input por stdin — el camino que funciona
//! de forma confiable con inputs en vivo. El kiosko reproduce el video en el
//! canvas WebGL y el audio en un `<audio>` aparte.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context};
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, ChildStdout, Command};
use tokio::task::JoinHandle;

use super::core::PixelFormat;
use super::runner::{Frame, SessionShared};

fn log_stderr(stderr: Option<tokio::process::ChildStderr>) {
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::warn!(%line, "arcade ffmpeg");
            }
        });
    }
}

/// Video: rawvideo por stdin → H.264 fMP4.
pub struct Encoder {
    child: Child,
    stdout: Option<ChildStdout>,
    stop: Arc<AtomicBool>,
    task: Option<JoinHandle<()>>,
}

impl Encoder {
    pub async fn start(shared: Arc<SessionShared>) -> anyhow::Result<Self> {
        let first = wait_for_frame(&shared, Duration::from_secs(3))
            .await
            .ok_or_else(|| anyhow!("el core no produjo frames"))?;
        // El tamaño del stream es el base declarado por el core, no el del
        // primer frame: durante el arranque el core puede estar en un modo
        // hi-res (ej. 512x224) y después pasar al modo normal (256x224).
        let (base_width, base_height) = shared.resolution();
        let (width, height) = if base_width > 0 && base_height > 0 {
            (base_width, base_height)
        } else {
            (first.width, first.height)
        };
        let fps = shared.fps().clamp(1.0, 240.0);
        let pix_fmt = first.format.ffmpeg_name();
        tracing::info!(
            width,
            height,
            source_width = first.width,
            source_height = first.height,
            source_pitch = first.pitch,
            fps,
            pix_fmt,
            "arcade: encode video"
        );

        let mut child = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-fflags",
                "nobuffer",
                "-probesize",
                "32",
                "-analyzeduration",
                "0",
                "-f",
                "rawvideo",
                "-pix_fmt",
                pix_fmt,
                "-s",
                &format!("{width}x{height}"),
                "-r",
                &format!("{fps:.4}"),
                "-i",
                "pipe:0",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-pix_fmt",
                "yuv420p",
                "-g",
                &format!("{}", (fps / 2.0).max(1.0) as u32),
                "-f",
                "mp4",
                "-movflags",
                "frag_keyframe+empty_moov+default_base_moof",
                "-flush_packets",
                "1",
                "pipe:1",
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .context("no se pudo lanzar ffmpeg (video)")?;

        let mut stdin = child.stdin.take().ok_or_else(|| anyhow!("sin stdin"))?;
        let stdout = child.stdout.take();
        log_stderr(child.stderr.take());

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let task = tokio::spawn(async move {
            write_video(&mut stdin, shared, first, width, height, fps, thread_stop).await;
        });

        Ok(Self {
            child,
            stdout,
            stop,
            task: Some(task),
        })
    }

    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.stdout.take()
    }

    pub fn stdout_taken(&self) -> bool {
        self.stdout.is_none()
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(task) = self.task.take() {
            task.abort();
        }
        let _ = self.child.start_kill();
    }
}

impl Drop for Encoder {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Audio: PCM s16le por stdin → AAC fMP4 (audio-only).
pub struct AudioEncoder {
    child: Child,
    stdout: Option<ChildStdout>,
    stop: Arc<AtomicBool>,
    task: Option<JoinHandle<()>>,
}

impl AudioEncoder {
    pub fn start(shared: Arc<SessionShared>) -> anyhow::Result<Self> {
        let sample_rate = shared.sample_rate().max(8000);
        tracing::info!(sample_rate, "arcade: encode audio");
        let mut child = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-fflags",
                "nobuffer",
                "-probesize",
                "32",
                "-analyzeduration",
                "0",
                "-f",
                "s16le",
                "-ar",
                &sample_rate.to_string(),
                "-ac",
                "2",
                "-i",
                "pipe:0",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-f",
                "mp4",
                // Sin video no hay keyframes: se fragmenta por tiempo.
                "-frag_duration",
                "200000",
                "-movflags",
                "frag_keyframe+empty_moov+default_base_moof",
                "-flush_packets",
                "1",
                "pipe:1",
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .context("no se pudo lanzar ffmpeg (audio)")?;

        let mut stdin = child.stdin.take().ok_or_else(|| anyhow!("sin stdin"))?;
        let stdout = child.stdout.take();
        log_stderr(child.stderr.take());

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let task = tokio::spawn(async move {
            write_audio(&mut stdin, shared, sample_rate, thread_stop).await;
        });

        Ok(Self {
            child,
            stdout,
            stop,
            task: Some(task),
        })
    }

    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.stdout.take()
    }

    pub fn stdout_taken(&self) -> bool {
        self.stdout.is_none()
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(task) = self.task.take() {
            task.abort();
        }
        let _ = self.child.start_kill();
    }
}

impl Drop for AudioEncoder {
    fn drop(&mut self) {
        self.stop();
    }
}

async fn wait_for_frame(shared: &SessionShared, timeout: Duration) -> Option<Frame> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Some(frame) = shared.take_frame() {
            return Some(frame);
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    None
}

async fn write_video(
    stdin: &mut tokio::process::ChildStdin,
    shared: Arc<SessionShared>,
    first: Frame,
    target_width: u32,
    target_height: u32,
    fps: f64,
    stop: Arc<AtomicBool>,
) {
    let frame_time = Duration::from_secs_f64(1.0 / fps);
    let format = first.format;
    let mut pending = Some(first);
    let mut last = Instant::now();
    let mut packed: Vec<u8> = Vec::new();
    let mut warned_format = false;

    while !stop.load(Ordering::SeqCst) {
        let frame = match pending.take() {
            Some(frame) => frame,
            None => match shared.take_frame() {
                Some(frame) => frame,
                None => {
                    tokio::time::sleep(Duration::from_millis(2)).await;
                    continue;
                }
            },
        };
        if frame.format != format && !warned_format {
            warned_format = true;
            tracing::warn!(
                expected = ?format,
                got = ?frame.format,
                "arcade: el core cambió el formato de píxel; se mantiene el del encoder"
            );
        }
        // Los cores pueden reportar pitch con padding (fila más larga que
        // width × bytes por píxel) y cambiar de resolución entre frames. Se
        // normaliza a un buffer tight-packed del tamaño fijo del stream.
        pack_frame(&frame, format, target_width, target_height, &mut packed);
        if stdin.write_all(&packed).await.is_err() {
            break;
        }
        if stdin.flush().await.is_err() {
            break;
        }
        let elapsed = last.elapsed();
        if elapsed < frame_time {
            tokio::time::sleep(frame_time - elapsed).await;
        }
        last = Instant::now();
    }
    let _ = stdin.flush().await;
}

/// Copia/reescala un frame a un buffer tight-packed `target_width × target_height`.
///
/// - Descarta el padding de fila del core (`pitch > width * bpp`).
/// - Si el frame viene en otra resolución (hi-res, cambios de modo), aplica
///   nearest-neighbor para mantener el stream en un tamaño estable.
fn pack_frame(
    frame: &Frame,
    format: PixelFormat,
    target_width: u32,
    target_height: u32,
    out: &mut Vec<u8>,
) {
    let bpp = match format {
        PixelFormat::Rgb1555 | PixelFormat::Rgb565 => 2,
        PixelFormat::Xrgb8888 => 4,
    };
    let src_w = frame.width.max(1) as usize;
    let src_h = frame.height.max(1) as usize;
    let dst_w = target_width.max(1) as usize;
    let dst_h = target_height.max(1) as usize;
    let src_row = src_w * bpp;
    let src_pitch = frame.pitch.max(src_row);
    let data_len = frame.data.len();

    out.clear();
    out.resize(dst_w * dst_h * bpp, 0);

    for y in 0..dst_h {
        let src_y = (y * src_h / dst_h).min(src_h - 1);
        let src_line = src_y * src_pitch;
        let dst_line = y * dst_w * bpp;
        if src_w == dst_w {
            let take = src_row.min(data_len.saturating_sub(src_line));
            if take > 0 {
                out[dst_line..dst_line + take]
                    .copy_from_slice(&frame.data[src_line..src_line + take]);
            }
        } else {
            for x in 0..dst_w {
                let src_x = (x * src_w / dst_w).min(src_w - 1);
                let src_index = src_line + src_x * bpp;
                if src_index + bpp <= data_len {
                    let dst_index = dst_line + x * bpp;
                    out[dst_index..dst_index + bpp]
                        .copy_from_slice(&frame.data[src_index..src_index + bpp]);
                }
            }
        }
    }
}

async fn write_audio(
    stdin: &mut tokio::process::ChildStdin,
    shared: Arc<SessionShared>,
    sample_rate: u32,
    stop: Arc<AtomicBool>,
) {
    // ~10 ms de audio por escritura.
    let chunk = (sample_rate as usize / 100).max(64) * 2;
    let mut buffer: Vec<i16> = Vec::with_capacity(chunk);
    let mut bytes: Vec<u8> = Vec::with_capacity(chunk * 2);

    while !stop.load(Ordering::SeqCst) {
        shared.read_audio(&mut buffer, chunk);
        if buffer.is_empty() {
            tokio::time::sleep(Duration::from_millis(5)).await;
            continue;
        }
        bytes.clear();
        for sample in &buffer {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        if stdin.write_all(&bytes).await.is_err() {
            break;
        }
        if stdin.flush().await.is_err() {
            break;
        }
    }
    let _ = stdin.flush().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(width: u32, height: u32, pitch: usize, data: Vec<u8>) -> Frame {
        Frame {
            width,
            height,
            pitch,
            format: PixelFormat::Rgb565,
            data,
        }
    }

    #[test]
    fn pack_frame_strips_row_padding() {
        // 2x2 RGB565 con pitch de 8 bytes: 4 bytes de padding por fila.
        let data = vec![
            1, 2, 3, 4, 0xAA, 0xAA, 0xAA, 0xAA, 5, 6, 7, 8, 0xBB, 0xBB, 0xBB, 0xBB,
        ];
        let source = frame(2, 2, 8, data);
        let mut out = Vec::new();
        pack_frame(&source, source.format, 2, 2, &mut out);
        assert_eq!(out, vec![1, 2, 3, 4, 5, 6, 7, 8]);
    }

    #[test]
    fn pack_frame_scales_to_target() {
        let data = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let source = frame(2, 2, 4, data);
        let mut out = Vec::new();
        pack_frame(&source, source.format, 4, 4, &mut out);
        assert_eq!(out.len(), 4 * 4 * 2);
        // Nearest-neighbor: cada píxel ocupa 2x2 en el destino.
        assert_eq!(&out[0..8], &[1, 2, 1, 2, 3, 4, 3, 4]);
        assert_eq!(&out[8..16], &[1, 2, 1, 2, 3, 4, 3, 4]);
        assert_eq!(&out[16..24], &[5, 6, 5, 6, 7, 8, 7, 8]);
        assert_eq!(&out[24..32], &[5, 6, 5, 6, 7, 8, 7, 8]);
    }
}
