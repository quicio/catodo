//! FFI mínimo de libretro (sin bindgen) y carga de cores.

use std::ffi::{c_char, c_void, CStr};
use std::path::Path;

use anyhow::{anyhow, Context};
use libloading::{Library, Symbol};

pub type RetroEnvironment = unsafe extern "C" fn(cmd: u32, data: *mut c_void) -> bool;
pub type RetroVideoRefresh =
    unsafe extern "C" fn(data: *const c_void, width: u32, height: u32, pitch: usize);
pub type RetroAudioSample = unsafe extern "C" fn(left: i16, right: i16);
pub type RetroAudioBatch = unsafe extern "C" fn(data: *const i16, frames: usize) -> usize;
pub type RetroInputPoll = unsafe extern "C" fn();
pub type RetroInputState = unsafe extern "C" fn(port: u32, device: u32, index: u32, id: u32) -> i16;

#[repr(C)]
pub struct RetroGameInfo {
    pub path: *const c_char,
    pub data: *const c_void,
    pub size: usize,
    pub meta: *const c_char,
}

#[repr(C)]
pub struct RetroSystemInfo {
    pub library_name: *const c_char,
    pub library_version: *const c_char,
    pub valid_extensions: *const c_char,
    pub need_fullpath: bool,
    pub block_extract: bool,
}

#[repr(C)]
#[derive(Default)]
pub struct RetroGameGeometry {
    pub base_width: u32,
    pub base_height: u32,
    pub max_width: u32,
    pub max_height: u32,
    pub aspect_ratio: f32,
}

#[repr(C)]
#[derive(Default)]
pub struct RetroSystemTiming {
    pub fps: f64,
    pub sample_rate: f64,
}

#[repr(C)]
#[derive(Default)]
pub struct RetroSystemAvInfo {
    pub geometry: RetroGameGeometry,
    pub timing: RetroSystemTiming,
}

/// Formato de píxel reportado por el core.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    Rgb1555,
    Xrgb8888,
    Rgb565,
}

impl PixelFormat {
    pub fn from_raw(value: u32) -> Self {
        match value {
            0 => Self::Rgb1555,
            1 => Self::Xrgb8888,
            _ => Self::Rgb565,
        }
    }

    /// Bytes por píxel, para el `rawvideo` de ffmpeg.
    pub fn bytes_per_pixel(self) -> usize {
        match self {
            Self::Rgb1555 | Self::Rgb565 => 2,
            Self::Xrgb8888 => 4,
        }
    }

    /// Nombre de formato para `ffmpeg -f rawvideo -pix_fmt`.
    pub fn ffmpeg_name(self) -> &'static str {
        match self {
            Self::Rgb1555 => "rgb555le",
            Self::Xrgb8888 => "bgra",
            Self::Rgb565 => "rgb565le",
        }
    }
}

// Comandos de environment que el host debe contestar.
pub const ENV_GET_CAN_DUPE: u32 = 3;
pub const ENV_SET_PERFORMANCE_LEVEL: u32 = 8;
pub const ENV_GET_SYSTEM_DIRECTORY: u32 = 9;
pub const ENV_SET_PIXEL_FORMAT: u32 = 10;
pub const ENV_SET_INPUT_DESCRIPTORS: u32 = 11;
pub const ENV_GET_VARIABLE: u32 = 15;
pub const ENV_SET_VARIABLES: u32 = 16;
pub const ENV_GET_VARIABLE_UPDATE: u32 = 17;
pub const ENV_SET_SUPPORT_NO_GAME: u32 = 18;
pub const ENV_GET_SAVE_DIRECTORY: u32 = 31;
pub const ENV_SET_SYSTEM_AV_INFO: u32 = 32;
pub const ENV_SET_CONTROLLER_INFO: u32 = 35;
pub const ENV_SET_MEMORY_MAPS: u32 = 36;
pub const ENV_SET_GEOMETRY: u32 = 37;
pub const ENV_GET_LANGUAGE: u32 = 39;
pub const ENV_SET_CORE_OPTIONS: u32 = 53;
pub const ENV_SET_CORE_OPTIONS_INTL: u32 = 54;
pub const ENV_SET_CORE_OPTIONS_V2: u32 = 67;
pub const ENV_SET_CORE_OPTIONS_V2_INTL: u32 = 68;
pub const ENV_SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK: u32 = 69;

/// Botones del joypad (ABI `RETRO_DEVICE_ID_JOYPAD_*`).
pub mod button {
    pub const B: u32 = 0;
    pub const Y: u32 = 1;
    pub const SELECT: u32 = 2;
    pub const START: u32 = 3;
    pub const UP: u32 = 4;
    pub const DOWN: u32 = 5;
    pub const LEFT: u32 = 6;
    pub const RIGHT: u32 = 7;
    pub const A: u32 = 8;
    pub const X: u32 = 9;
    pub const L: u32 = 10;
    pub const R: u32 = 11;
    pub const L2: u32 = 12;
    pub const R2: u32 = 13;
    pub const L3: u32 = 14;
    pub const R3: u32 = 15;

    /// Nombre de la API (`press`/`release`) → bit del joypad.
    pub fn from_name(name: &str) -> Option<u32> {
        Some(match name.to_ascii_lowercase().as_str() {
            "b" => B,
            "y" => Y,
            "select" | "back" => SELECT,
            "start" => START,
            "up" => UP,
            "down" => DOWN,
            "left" => LEFT,
            "right" => RIGHT,
            "a" => A,
            "x" => X,
            "l" | "l1" => L,
            "r" | "r1" => R,
            "l2" => L2,
            "r2" => R2,
            "l3" => L3,
            "r3" => R3,
            _ => return None,
        })
    }
}

pub struct CoreSystemInfo {
    pub library_name: String,
    pub library_version: String,
    pub valid_extensions: String,
    pub need_fullpath: bool,
}

/// Core libretro cargado en memoria.
pub struct Core {
    // La librería debe vivir mientras existan los punteros de función.
    _lib: Library,
    retro_init: unsafe extern "C" fn(),
    retro_deinit: unsafe extern "C" fn(),
    retro_api_version: unsafe extern "C" fn() -> u32,
    set_environment: unsafe extern "C" fn(RetroEnvironment),
    set_video_refresh: unsafe extern "C" fn(RetroVideoRefresh),
    set_audio_sample: unsafe extern "C" fn(RetroAudioSample),
    set_audio_sample_batch: unsafe extern "C" fn(RetroAudioBatch),
    set_input_poll: unsafe extern "C" fn(RetroInputPoll),
    set_input_state: unsafe extern "C" fn(RetroInputState),
    get_system_info: unsafe extern "C" fn(*mut RetroSystemInfo),
    get_system_av_info: unsafe extern "C" fn(*mut RetroSystemAvInfo),
    set_controller_port_device: unsafe extern "C" fn(u32, u32),
    reset: unsafe extern "C" fn(),
    run: unsafe extern "C" fn(),
    serialize_size: unsafe extern "C" fn() -> usize,
    serialize: unsafe extern "C" fn(*mut c_void, usize) -> bool,
    unserialize: unsafe extern "C" fn(*const c_void, usize) -> bool,
    load_game: unsafe extern "C" fn(*const RetroGameInfo) -> bool,
    unload_game: unsafe extern "C" fn(),
    initialized: bool,
}

impl Core {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let lib = unsafe { Library::new(path) }
            .with_context(|| format!("no se pudo abrir el core {}", path.display()))?;

        macro_rules! sym {
            ($name:literal, $ty:ty) => {{
                let symbol: Symbol<$ty> = unsafe { lib.get($name) }
                    .with_context(|| format!("el core no exporta {}", stringify!($name)))?;
                *symbol
            }};
        }

        Ok(Self {
            retro_init: sym!(b"retro_init\0", unsafe extern "C" fn()),
            retro_deinit: sym!(b"retro_deinit\0", unsafe extern "C" fn()),
            retro_api_version: sym!(b"retro_api_version\0", unsafe extern "C" fn() -> u32),
            set_environment: sym!(
                b"retro_set_environment\0",
                unsafe extern "C" fn(RetroEnvironment)
            ),
            set_video_refresh: sym!(
                b"retro_set_video_refresh\0",
                unsafe extern "C" fn(RetroVideoRefresh)
            ),
            set_audio_sample: sym!(
                b"retro_set_audio_sample\0",
                unsafe extern "C" fn(RetroAudioSample)
            ),
            set_audio_sample_batch: sym!(
                b"retro_set_audio_sample_batch\0",
                unsafe extern "C" fn(RetroAudioBatch)
            ),
            set_input_poll: sym!(
                b"retro_set_input_poll\0",
                unsafe extern "C" fn(RetroInputPoll)
            ),
            set_input_state: sym!(
                b"retro_set_input_state\0",
                unsafe extern "C" fn(RetroInputState)
            ),
            get_system_info: sym!(
                b"retro_get_system_info\0",
                unsafe extern "C" fn(*mut RetroSystemInfo)
            ),
            get_system_av_info: sym!(
                b"retro_get_system_av_info\0",
                unsafe extern "C" fn(*mut RetroSystemAvInfo)
            ),
            set_controller_port_device: sym!(
                b"retro_set_controller_port_device\0",
                unsafe extern "C" fn(u32, u32)
            ),
            reset: sym!(b"retro_reset\0", unsafe extern "C" fn()),
            run: sym!(b"retro_run\0", unsafe extern "C" fn()),
            serialize_size: sym!(b"retro_serialize_size\0", unsafe extern "C" fn() -> usize),
            serialize: sym!(
                b"retro_serialize\0",
                unsafe extern "C" fn(*mut c_void, usize) -> bool
            ),
            unserialize: sym!(
                b"retro_unserialize\0",
                unsafe extern "C" fn(*const c_void, usize) -> bool
            ),
            load_game: sym!(
                b"retro_load_game\0",
                unsafe extern "C" fn(*const RetroGameInfo) -> bool
            ),
            unload_game: sym!(b"retro_unload_game\0", unsafe extern "C" fn()),
            _lib: lib,
            initialized: false,
        })
    }

    pub fn api_version(&self) -> u32 {
        unsafe { (self.retro_api_version)() }
    }

    pub fn set_callbacks(
        &self,
        env: RetroEnvironment,
        video: RetroVideoRefresh,
        audio: RetroAudioSample,
        audio_batch: RetroAudioBatch,
        input_poll: RetroInputPoll,
        input_state: RetroInputState,
    ) {
        unsafe {
            (self.set_environment)(env);
            (self.set_video_refresh)(video);
            (self.set_audio_sample)(audio);
            (self.set_audio_sample_batch)(audio_batch);
            (self.set_input_poll)(input_poll);
            (self.set_input_state)(input_state);
        }
    }

    pub fn init(&mut self) {
        if !self.initialized {
            unsafe { (self.retro_init)() };
            self.initialized = true;
        }
    }

    pub fn system_info(&self) -> CoreSystemInfo {
        let mut info = RetroSystemInfo {
            library_name: std::ptr::null(),
            library_version: std::ptr::null(),
            valid_extensions: std::ptr::null(),
            need_fullpath: false,
            block_extract: false,
        };
        unsafe { (self.get_system_info)(&mut info) };
        CoreSystemInfo {
            library_name: cstr(info.library_name),
            library_version: cstr(info.library_version),
            valid_extensions: cstr(info.valid_extensions),
            need_fullpath: info.need_fullpath,
        }
    }

    pub fn av_info(&self) -> RetroSystemAvInfo {
        let mut av = RetroSystemAvInfo::default();
        unsafe { (self.get_system_av_info)(&mut av) };
        av
    }

    pub fn set_controller_port_device(&self, port: u32, device: u32) {
        unsafe { (self.set_controller_port_device)(port, device) };
    }

    pub fn load_game(&self, path: &Path, data: &[u8]) -> anyhow::Result<()> {
        let c_path = std::ffi::CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| anyhow!("ruta de ROM inválida"))?;
        let info = RetroGameInfo {
            path: c_path.as_ptr(),
            data: data.as_ptr() as *const c_void,
            size: data.len(),
            meta: std::ptr::null(),
        };
        if unsafe { (self.load_game)(&info) } {
            Ok(())
        } else {
            Err(anyhow!("el core rechazó la ROM"))
        }
    }

    pub fn run(&self) {
        unsafe { (self.run)() };
    }

    pub fn reset(&self) {
        unsafe { (self.reset)() };
    }

    pub fn serialize_size(&self) -> usize {
        unsafe { (self.serialize_size)() }
    }

    pub fn serialize(&self) -> Option<Vec<u8>> {
        let size = self.serialize_size();
        if size == 0 {
            return None;
        }
        let mut buffer = vec![0u8; size];
        if unsafe { (self.serialize)(buffer.as_mut_ptr() as *mut c_void, size) } {
            Some(buffer)
        } else {
            None
        }
    }

    pub fn unserialize(&self, data: &[u8]) -> bool {
        unsafe { (self.unserialize)(data.as_ptr() as *const c_void, data.len()) }
    }

    pub fn unload_game(&self) {
        unsafe { (self.unload_game)() };
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        if self.initialized {
            unsafe { (self.retro_deinit)() };
        }
    }
}

fn cstr(ptr: *const c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(ptr).to_string_lossy().to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_formats_match_ffmpeg_names() {
        assert_eq!(PixelFormat::from_raw(0), PixelFormat::Rgb1555);
        assert_eq!(PixelFormat::from_raw(1), PixelFormat::Xrgb8888);
        assert_eq!(PixelFormat::from_raw(2), PixelFormat::Rgb565);
        assert_eq!(PixelFormat::Xrgb8888.bytes_per_pixel(), 4);
        assert_eq!(PixelFormat::Rgb565.ffmpeg_name(), "rgb565le");
    }

    #[test]
    fn button_names_map_to_abi() {
        assert_eq!(button::from_name("A"), Some(button::A));
        assert_eq!(button::from_name("start"), Some(button::START));
        assert_eq!(button::from_name("nope"), None);
    }

    #[test]
    fn loads_a_core_when_env_is_set() {
        let Ok(path) = std::env::var("CATODO_TEST_CORE") else {
            return;
        };
        let core = Core::load(Path::new(&path)).expect("core");
        assert_eq!(core.api_version(), 1);
        let info = core.system_info();
        assert!(!info.library_name.is_empty());
    }
}
