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
        let (width, height) = (first.width, first.height);
        let fps = shared.fps().clamp(1.0, 240.0);
        let pix_fmt = first.format.ffmpeg_name();
        tracing::info!(width, height, fps, pix_fmt, "arcade: encode video");

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
            write_video(&mut stdin, shared, first, fps, thread_stop).await;
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
    fps: f64,
    stop: Arc<AtomicBool>,
) {
    let frame_time = Duration::from_secs_f64(1.0 / fps);
    let mut pending = Some(first);
    let mut last = Instant::now();

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
        if stdin.write_all(&frame.data).await.is_err() {
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
