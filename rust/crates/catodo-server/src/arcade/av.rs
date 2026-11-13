//! Encode del frame del core a fMP4 (video) para el stream del kiosko.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context};
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, ChildStdout, Command};
use tokio::task::JoinHandle;

use super::runner::{Frame, SessionShared};

/// Pipeline ffmpeg: frames del core → H.264 en fMP4 por stdout.
pub struct Encoder {
    child: Child,
    stdout: Option<ChildStdout>,
    stop: Arc<AtomicBool>,
    writer: Option<JoinHandle<()>>,
}

impl Encoder {
    /// Arranca ffmpeg con la geometría del primer frame disponible.
    pub async fn start(shared: Arc<SessionShared>) -> anyhow::Result<Self> {
        let first = wait_for_frame(&shared, Duration::from_secs(3))
            .await
            .ok_or_else(|| anyhow!("el core no produjo frames"))?;
        let (width, height) = (first.width, first.height);
        let fps = shared.fps().clamp(1.0, 240.0);
        let pix_fmt = first.format.ffmpeg_name();

        let mut child = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-fflags",
                "nobuffer",
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
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .context("no se pudo lanzar ffmpeg para el arcade")?;

        let mut stdin = child.stdin.take().ok_or_else(|| anyhow!("sin stdin"))?;
        let stdout = child.stdout.take();
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let writer = tokio::spawn(async move {
            write_frames(&mut stdin, shared, first, fps, thread_stop).await;
        });

        Ok(Self {
            child,
            stdout,
            stop,
            writer: Some(writer),
        })
    }

    /// stdout de ffmpeg (fMP4) para servir por HTTP.
    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.stdout.take()
    }

    pub fn stdout_taken(&self) -> bool {
        self.stdout.is_none()
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(writer) = self.writer.take() {
            writer.abort();
        }
        let _ = self.child.start_kill();
    }
}

impl Drop for Encoder {
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

async fn write_frames(
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
}
