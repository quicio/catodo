//! Sesión de emulación: thread del core, callbacks y estado compartido.

use std::cell::RefCell;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context};
use tokio::sync::watch;

use crate::channels::LiveFrame;

use super::core::{
    button, Core, PixelFormat, RetroAudioBatch, RetroAudioSample, RetroEnvironment, RetroInputPoll,
    RetroInputState, RetroSystemAvInfo, RetroVideoRefresh, ENV_GET_CAN_DUPE, ENV_GET_LANGUAGE,
    ENV_GET_SAVE_DIRECTORY, ENV_GET_SYSTEM_DIRECTORY, ENV_GET_VARIABLE, ENV_GET_VARIABLE_UPDATE,
    ENV_SET_CONTROLLER_INFO, ENV_SET_CORE_OPTIONS, ENV_SET_CORE_OPTIONS_INTL,
    ENV_SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK, ENV_SET_CORE_OPTIONS_V2,
    ENV_SET_CORE_OPTIONS_V2_INTL, ENV_SET_GEOMETRY, ENV_SET_INPUT_DESCRIPTORS, ENV_SET_MEMORY_MAPS,
    ENV_SET_PERFORMANCE_LEVEL, ENV_SET_PIXEL_FORMAT, ENV_SET_SUPPORT_NO_GAME,
    ENV_SET_SYSTEM_AV_INFO, ENV_SET_VARIABLES,
};
use super::cores::state_path;

/// Último frame producido por el core.
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub pitch: usize,
    pub format: PixelFormat,
    pub data: Vec<u8>,
}

/// Estado que comparten el thread del core y el canal.
pub struct SessionShared {
    frame: Mutex<Option<Frame>>,
    buttons: AtomicU16,
    pixel_format: AtomicU32,
    running: AtomicBool,
    fps: Mutex<f64>,
    aspect: Mutex<f32>,
    sample_rate: AtomicU32,
    width: AtomicU32,
    height: AtomicU32,
    audio_samples: AtomicU64,
    runs: AtomicU64,
    audio: Mutex<VecDeque<i16>>,
    frame_tx: watch::Sender<Option<Arc<LiveFrame>>>,
    h264: AtomicBool,
    core_name: Mutex<Option<String>>,
    error: Mutex<Option<String>>,
}

impl Default for SessionShared {
    fn default() -> Self {
        let (frame_tx, _) = watch::channel(None);
        Self {
            frame: Mutex::new(None),
            buttons: AtomicU16::new(0),
            pixel_format: AtomicU32::new(2),
            running: AtomicBool::new(true),
            fps: Mutex::new(60.0),
            aspect: Mutex::new(0.0),
            sample_rate: AtomicU32::new(48000),
            width: AtomicU32::new(0),
            height: AtomicU32::new(0),
            audio_samples: AtomicU64::new(0),
            runs: AtomicU64::new(0),
            audio: Mutex::new(VecDeque::new()),
            frame_tx,
            h264: AtomicBool::new(false),
            core_name: Mutex::new(None),
            error: Mutex::new(None),
        }
    }
}

impl crate::channels::AudioSource for SessionShared {
    fn sample_rate(&self) -> u32 {
        SessionShared::sample_rate(self)
    }

    fn read_audio(&self, out: &mut Vec<i16>, max: usize) {
        SessionShared::read_audio(self, out, max);
    }

    fn clear(&self) {
        self.clear_audio();
    }
}

impl SessionShared {
    pub fn take_frame(&self) -> Option<Frame> {
        self.frame.lock().ok().and_then(|mut slot| slot.take())
    }

    pub fn resolution(&self) -> (u32, u32) {
        (
            self.width.load(Ordering::Relaxed),
            self.height.load(Ordering::Relaxed),
        )
    }

    pub fn fps(&self) -> f64 {
        self.fps.lock().map(|value| *value).unwrap_or(60.0)
    }

    /// Relación de aspecto de pantalla declarada por el core (ej. 4:3).
    pub fn aspect_ratio(&self) -> f32 {
        self.aspect.lock().map(|value| *value).unwrap_or(0.0)
    }

    pub fn audio_samples(&self) -> u64 {
        self.audio_samples.load(Ordering::Relaxed)
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Relaxed)
    }

    /// Copia hasta `max` samples al buffer dado (L/R intercalados).
    pub fn read_audio(&self, out: &mut Vec<i16>, max: usize) {
        let Ok(mut queue) = self.audio.lock() else {
            return;
        };
        let take = max.min(queue.len());
        out.clear();
        out.reserve(take);
        for _ in 0..take {
            if let Some(sample) = queue.pop_front() {
                out.push(sample);
            }
        }
    }

    /// Descarta el audio acumulado antes de arrancar el encoder: evita que el
    /// stream de audio empiece con hasta ~1 s de muestras viejas.
    pub fn clear_audio(&self) {
        if let Ok(mut queue) = self.audio.lock() {
            queue.clear();
        }
    }

    pub fn subscribe_frames(&self) -> watch::Receiver<Option<Arc<LiveFrame>>> {
        self.frame_tx.subscribe()
    }

    /// El encoder H.264 necesita que el core guarde el frame crudo.
    pub fn request_h264(&self) {
        self.h264.store(true, Ordering::Relaxed);
    }

    pub fn runs(&self) -> u64 {
        self.runs.load(Ordering::Relaxed)
    }

    pub fn core_name(&self) -> Option<String> {
        self.core_name.lock().ok().and_then(|value| value.clone())
    }

    pub fn error(&self) -> Option<String> {
        self.error.lock().ok().and_then(|value| value.clone())
    }

    pub fn set_error(&self, message: impl Into<String>) {
        if let Ok(mut slot) = self.error.lock() {
            *slot = Some(message.into());
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn press(&self, name: &str) -> bool {
        let Some(bit) = button::from_name(name) else {
            return false;
        };
        self.buttons.fetch_or(1 << bit, Ordering::SeqCst);
        true
    }

    pub fn release(&self, name: &str) -> bool {
        let Some(bit) = button::from_name(name) else {
            return false;
        };
        self.buttons.fetch_and(!(1 << bit), Ordering::SeqCst);
        true
    }

    fn release_all(&self) {
        self.buttons.store(0, Ordering::SeqCst);
    }
}

thread_local! {
    static CTX: RefCell<Option<Arc<SessionShared>>> = const { RefCell::new(None) };
}

fn with_ctx(f: impl FnOnce(&Arc<SessionShared>)) {
    CTX.with(|slot| {
        if let Some(ctx) = slot.borrow().as_ref() {
            f(ctx);
        }
    });
}

unsafe extern "C" fn env_cb(cmd: u32, data: *mut std::ffi::c_void) -> bool {
    match cmd {
        ENV_SET_PIXEL_FORMAT => {
            if !data.is_null() {
                let raw = *(data as *const u32);
                with_ctx(|ctx| ctx.pixel_format.store(raw, Ordering::Relaxed));
            }
            true
        }
        ENV_GET_SYSTEM_DIRECTORY | ENV_GET_SAVE_DIRECTORY => {
            if data.is_null() {
                return false;
            }
            let dir = std::env::var("HOME")
                .map(|home| format!("{home}/.local/share/catodo/cores"))
                .unwrap_or_else(|_| "/tmp".to_string());
            let leaked = Box::leak(dir.into_boxed_str());
            *(data as *mut *const std::ffi::c_char) = leaked.as_ptr() as *const std::ffi::c_char;
            true
        }
        ENV_GET_CAN_DUPE => {
            if !data.is_null() {
                *(data as *mut bool) = true;
            }
            true
        }
        ENV_GET_LANGUAGE => {
            if !data.is_null() {
                *(data as *mut u32) = 0;
            }
            true
        }
        ENV_GET_VARIABLE => false,
        ENV_GET_VARIABLE_UPDATE => {
            if !data.is_null() {
                *(data as *mut bool) = false;
            }
            true
        }
        ENV_SET_PERFORMANCE_LEVEL
        | ENV_SET_INPUT_DESCRIPTORS
        | ENV_SET_VARIABLES
        | ENV_SET_SUPPORT_NO_GAME
        | ENV_SET_CONTROLLER_INFO
        | ENV_SET_MEMORY_MAPS
        | ENV_SET_SYSTEM_AV_INFO
        | ENV_SET_GEOMETRY
        | ENV_SET_CORE_OPTIONS
        | ENV_SET_CORE_OPTIONS_INTL
        | ENV_SET_CORE_OPTIONS_V2
        | ENV_SET_CORE_OPTIONS_V2_INTL
        | ENV_SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK => true,
        _ => false,
    }
}

unsafe extern "C" fn video_cb(
    data: *const std::ffi::c_void,
    width: u32,
    height: u32,
    pitch: usize,
) {
    if data.is_null() || width == 0 || height == 0 {
        return;
    }
    with_ctx(|ctx| {
        let format = PixelFormat::from_raw(ctx.pixel_format.load(Ordering::Relaxed));
        if ctx.frame_tx.receiver_count() > 0 {
            let len = pitch * height as usize;
            let raw = std::slice::from_raw_parts(data as *const u8, len);
            if let Some(pixels) = rgb565_from_raw(raw, width, height, pitch, format) {
                let live = Arc::new(LiveFrame {
                    width,
                    height,
                    data: Arc::new(pixels),
                });
                ctx.frame_tx.send_replace(Some(live));
            }
        }
        // Sólo el fallback H.264 consume el frame crudo; el player usa RGB565.
        if ctx.h264.load(Ordering::Relaxed) {
            let len = pitch * height as usize;
            let bytes = std::slice::from_raw_parts(data as *const u8, len).to_vec();
            if let Ok(mut slot) = ctx.frame.lock() {
                *slot = Some(Frame {
                    width,
                    height,
                    pitch,
                    format,
                    data: bytes,
                });
            }
        }
    });
}

/// Convierte un frame crudo del core (con pitch) a RGB565 tight-packed.
fn rgb565_from_raw(
    data: &[u8],
    width: u32,
    height: u32,
    pitch: usize,
    format: PixelFormat,
) -> Option<Vec<u8>> {
    let bpp = format.bytes_per_pixel();
    let row_bytes = width as usize * bpp;
    let source_pitch = pitch.max(row_bytes);
    if data.len() < source_pitch * height as usize {
        return None;
    }
    let mut out = vec![0u8; width as usize * height as usize * 2];
    for y in 0..height as usize {
        let line = &data[y * source_pitch..y * source_pitch + row_bytes];
        for x in 0..width as usize {
            let value: u16 = match format {
                PixelFormat::Rgb565 => u16::from_le_bytes([line[x * 2], line[x * 2 + 1]]),
                PixelFormat::Rgb1555 => {
                    let v = u16::from_le_bytes([line[x * 2], line[x * 2 + 1]]);
                    let r = (v >> 10) & 0x1f;
                    let g = (v >> 5) & 0x1f;
                    let b = v & 0x1f;
                    (r << 11) | (((g << 1) | (g >> 4)) << 5) | b
                }
                PixelFormat::Xrgb8888 => {
                    let b = line[x * 4] as u16;
                    let g = line[x * 4 + 1] as u16;
                    let r = line[x * 4 + 2] as u16;
                    ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
                }
            };
            let dst = (y * width as usize + x) * 2;
            out[dst..dst + 2].copy_from_slice(&value.to_le_bytes());
        }
    }
    Some(out)
}

/// Tope del buffer: ~1 s de audio estéreo.
fn audio_capacity(shared: &SessionShared) -> usize {
    (shared.sample_rate() as usize).max(8000) * 2
}

fn push_audio(shared: &SessionShared, samples: &[i16]) {
    let Ok(mut queue) = shared.audio.lock() else {
        return;
    };
    let cap = audio_capacity(shared);
    for sample in samples {
        if queue.len() >= cap {
            queue.pop_front();
        }
        queue.push_back(*sample);
    }
}

unsafe extern "C" fn audio_cb(left: i16, right: i16) {
    with_ctx(|ctx| {
        ctx.audio_samples.fetch_add(1, Ordering::Relaxed);
        push_audio(ctx, &[left, right]);
    });
}

unsafe extern "C" fn audio_batch_cb(data: *const i16, frames: usize) -> usize {
    if !data.is_null() && frames > 0 {
        let samples = std::slice::from_raw_parts(data, frames * 2);
        with_ctx(|ctx| {
            ctx.audio_samples
                .fetch_add(frames as u64, Ordering::Relaxed);
            push_audio(ctx, samples);
        });
    }
    frames
}

unsafe extern "C" fn input_poll_cb() {}

unsafe extern "C" fn input_state_cb(_port: u32, _device: u32, _index: u32, id: u32) -> i16 {
    let mut pressed = 0i16;
    with_ctx(|ctx| {
        let mask = ctx.buttons.load(Ordering::Relaxed);
        if id < 16 && mask & (1 << id) != 0 {
            pressed = 1;
        }
    });
    pressed
}

enum Command {
    Reset,
    Save(u32),
    Load(u32),
}

/// Sesión activa de emulación.
pub struct Session {
    shared: Arc<SessionShared>,
    commands: Sender<Command>,
    thread: Option<JoinHandle<()>>,
    rom: PathBuf,
}

impl Session {
    /// Arranca el core en un thread dedicado y espera a que cargue la ROM.
    pub fn start(core_path: &Path, rom_path: &Path) -> anyhow::Result<Self> {
        let shared = Arc::new(SessionShared::default());
        let (command_tx, command_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel::<anyhow::Result<()>>();

        let thread_shared = shared.clone();
        let thread_core = core_path.to_path_buf();
        let thread_rom = rom_path.to_path_buf();

        let thread = std::thread::Builder::new()
            .name("arcade-core".to_string())
            .spawn(move || {
                run_core(thread_core, thread_rom, thread_shared, command_rx, ready_tx);
            })
            .context("no se pudo crear el thread del core")?;

        match ready_rx.recv_timeout(Duration::from_secs(30)) {
            Ok(Ok(())) => Ok(Self {
                shared,
                commands: command_tx,
                thread: Some(thread),
                rom: rom_path.to_path_buf(),
            }),
            Ok(Err(error)) => {
                let _ = thread.join();
                Err(error)
            }
            Err(_) => Err(anyhow!("el core no respondió al iniciar")),
        }
    }

    pub fn shared(&self) -> Arc<SessionShared> {
        self.shared.clone()
    }

    pub fn press(&self, name: &str) -> bool {
        self.shared.press(name)
    }

    pub fn release(&self, name: &str) -> bool {
        self.shared.release(name)
    }

    pub fn reset(&self) -> anyhow::Result<()> {
        self.commands
            .send(Command::Reset)
            .map_err(|_| anyhow!("sesión cerrada"))
    }

    pub fn save_state(&self, slot: u32) -> anyhow::Result<()> {
        self.commands
            .send(Command::Save(slot))
            .map_err(|_| anyhow!("sesión cerrada"))
    }

    pub fn load_state(&self, slot: u32) -> anyhow::Result<()> {
        self.commands
            .send(Command::Load(slot))
            .map_err(|_| anyhow!("sesión cerrada"))
    }

    pub fn state_file(&self, slot: u32) -> PathBuf {
        state_path(&self.rom, slot)
    }

    /// Detiene el core y espera al thread.
    pub fn stop(&mut self) {
        self.shared.running.store(false, Ordering::SeqCst);
        self.shared.release_all();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.stop();
    }
}

fn run_core(
    core_path: PathBuf,
    rom_path: PathBuf,
    shared: Arc<SessionShared>,
    commands: Receiver<Command>,
    ready: Sender<anyhow::Result<()>>,
) {
    // macOS coalescea los timers de procesos de fondo y el core cae a ~45 fps
    // (el audio se queda corto). User-interactive le da un hilo de primer nivel.
    #[cfg(target_os = "macos")]
    unsafe {
        extern "C" {
            fn pthread_set_qos_class_self_np(qos_class: u32, relative_priority: i32) -> i32;
        }
        pthread_set_qos_class_self_np(0x21, 0); // QOS_CLASS_USER_INTERACTIVE
    }
    CTX.with(|slot| *slot.borrow_mut() = Some(shared.clone()));

    let mut core = match Core::load(&core_path) {
        Ok(core) => core,
        Err(error) => {
            let _ = ready.send(Err(error));
            return;
        }
    };
    let info = core.system_info();
    if let Ok(mut name) = shared.core_name.lock() {
        *name = Some(format!("{} {}", info.library_name, info.library_version));
    }

    core.set_callbacks(
        env_cb as RetroEnvironment,
        video_cb as RetroVideoRefresh,
        audio_cb as RetroAudioSample,
        audio_batch_cb as RetroAudioBatch,
        input_poll_cb as RetroInputPoll,
        input_state_cb as RetroInputState,
    );
    core.init();

    let rom = match std::fs::read(&rom_path) {
        Ok(rom) => rom,
        Err(error) => {
            let _ = ready.send(Err(anyhow!("no se pudo leer la ROM: {error}")));
            return;
        }
    };
    if let Err(error) = core.load_game(&rom_path, &rom) {
        let _ = ready.send(Err(error));
        return;
    }

    let av: RetroSystemAvInfo = core.av_info();
    tracing::info!(
        base_width = av.geometry.base_width,
        base_height = av.geometry.base_height,
        max_width = av.geometry.max_width,
        max_height = av.geometry.max_height,
        aspect_ratio = av.geometry.aspect_ratio,
        "arcade: system av info"
    );
    if let Ok(mut fps) = shared.fps.lock() {
        *fps = if av.timing.fps > 1.0 {
            av.timing.fps
        } else {
            60.0
        };
    }
    if let Ok(mut aspect) = shared.aspect.lock() {
        *aspect = av.geometry.aspect_ratio;
    }
    shared
        .sample_rate
        .store(av.timing.sample_rate.max(8000.0) as u32, Ordering::Relaxed);
    shared
        .width
        .store(av.geometry.base_width, Ordering::Relaxed);
    shared
        .height
        .store(av.geometry.base_height, Ordering::Relaxed);
    let _ = ready.send(Ok(()));

    let frame_time = Duration::from_secs_f64(1.0 / shared.fps());
    while shared.running.load(Ordering::SeqCst) {
        let started = Instant::now();

        while let Ok(command) = commands.try_recv() {
            match command {
                Command::Reset => core.reset(),
                Command::Save(slot) => {
                    if let Some(bytes) = core.serialize() {
                        let path = state_path(&rom_path, slot);
                        if let Err(error) = std::fs::write(&path, bytes) {
                            shared.set_error(format!("no se pudo guardar el estado: {error}"));
                        }
                    }
                }
                Command::Load(slot) => {
                    let path = state_path(&rom_path, slot);
                    match std::fs::read(&path) {
                        Ok(bytes) => {
                            if !core.unserialize(&bytes) {
                                shared.set_error("el core rechazó el savestate");
                            }
                        }
                        Err(error) => {
                            shared.set_error(format!("no se pudo leer el savestate: {error}"));
                        }
                    }
                }
            }
        }

        core.run();
        shared.runs.fetch_add(1, Ordering::Relaxed);

        let elapsed = started.elapsed();
        if elapsed < frame_time {
            let remaining = frame_time - elapsed;
            // En macOS el sleep de un proceso de fondo se estira varios ms por
            // coalescencia; se duerme el grueso y se cierra con spin hasta el
            // deadline para mantener los 60 fps (y el audio a 32 kHz).
            #[cfg(target_os = "macos")]
            {
                let margin = Duration::from_millis(5);
                if remaining > margin {
                    std::thread::sleep(remaining - margin);
                }
                while started.elapsed() < frame_time {
                    std::hint::spin_loop();
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                std::thread::sleep(remaining);
            }
        }
    }

    core.unload_game();
    CTX.with(|slot| *slot.borrow_mut() = None);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgb565_compacts_pitch_and_converts_formats() {
        // RGB565 2x2 con 4 bytes de padding por fila.
        let rgb565 = vec![
            0x00, 0xF8, 0xE0, 0x07, 0xAA, 0xAA, 0xAA, 0xAA, // rojo, verde
            0x1F, 0x00, 0xFF, 0xFF, 0xBB, 0xBB, 0xBB, 0xBB, // azul, blanco
        ];
        let packed = rgb565_from_raw(&rgb565, 2, 2, 8, PixelFormat::Rgb565).unwrap();
        assert_eq!(packed, vec![0x00, 0xF8, 0xE0, 0x07, 0x1F, 0x00, 0xFF, 0xFF]);

        // XRGB8888 little-endian: B,G,R,X.
        let xrgb = vec![0x00, 0x00, 0xFF, 0x00];
        let packed = rgb565_from_raw(&xrgb, 1, 1, 4, PixelFormat::Xrgb8888).unwrap();
        assert_eq!(packed, vec![0x00, 0xF8]);

        // RGB1555: bit alto de alpha + 5/5/5.
        let rgb1555 = vec![0x00, 0x7C];
        let packed = rgb565_from_raw(&rgb1555, 1, 1, 2, PixelFormat::Rgb1555).unwrap();
        assert_eq!(packed, vec![0x00, 0xF8]);
    }

    fn env_paths() -> Option<(PathBuf, PathBuf)> {
        let core = std::env::var("CATODO_TEST_CORE").ok()?;
        let rom = std::env::var("CATODO_TEST_ROM").ok()?;
        Some((PathBuf::from(core), PathBuf::from(rom)))
    }

    #[test]
    fn runs_frames_with_a_real_core() {
        let Some((core, rom)) = env_paths() else {
            return;
        };
        let mut session = Session::start(&core, &rom).expect("sesión");
        let shared = session.shared();

        let deadline = Instant::now() + Duration::from_secs(5);
        while shared.take_frame().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        let (width, height) = shared.resolution();
        assert!(width > 0 && height > 0, "el core no reportó resolución");
        assert!(shared.fps() > 1.0, "fps inválido");
        assert!(shared.core_name().is_some());

        assert!(session.press("start"));
        assert!(session.release("start"));
        assert!(!session.press("nope"));

        session.save_state(1).ok();
        std::thread::sleep(Duration::from_millis(200));
        session.load_state(1).ok();

        session.stop();
    }
}
