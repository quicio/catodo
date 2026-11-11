//! JSON persistence in the Cátodo data directory.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct Store {
    dir: PathBuf,
    lock: Arc<Mutex<()>>,
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn data_dir(&self) -> &Path {
        &self.dir
    }

    pub fn path(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{name}.json"))
    }

    fn ensure_dir(&self) {
        let _ = std::fs::create_dir_all(&self.dir);
        let _ = std::fs::create_dir_all(self.dir.join("wallpapers"));
    }

    /// Reads a JSON file. Corrupt files are moved aside to `<name>.json.bak`
    /// and the default is returned, matching the Python store.
    pub fn load(&self, name: &str, default: Value) -> Value {
        let file = self.path(name);
        if !file.is_file() {
            return default;
        }
        match std::fs::read_to_string(&file)
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        {
            Some(value) => value,
            None => {
                let bak = file.with_extension("json.bak");
                let _ = std::fs::rename(&file, bak);
                default
            }
        }
    }

    pub async fn save(&self, name: &str, data: &Value) -> anyhow::Result<()> {
        let _guard = self.lock.lock().await;
        self.ensure_dir();
        let file = self.path(name);
        let tmp = file.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(data)?;
        std::fs::write(&tmp, text)?;
        std::fs::rename(&tmp, &file)?;
        Ok(())
    }
}
