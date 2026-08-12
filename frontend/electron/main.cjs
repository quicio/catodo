const { app, BrowserWindow, screen, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

process.on("uncaughtException", (err) => {
  fs.appendFileSync("/tmp/catodo-dev.log", "\n[MAIN-EXC] " + (err && err.stack || err) + "\n");
});
process.on("unhandledRejection", (reason) => {
  fs.appendFileSync("/tmp/catodo-dev.log", "\n[MAIN-REJ] " + (reason && reason.stack || reason) + "\n");
});

const HOME = require("os").homedir();
const SHARED_PROFILE_DIR = process.env.CATODO_USER_DATA_DIR ||
  path.join(HOME, ".config", "chromium");

if (fs.existsSync(SHARED_PROFILE_DIR)) {
    app.setPath("userData", SHARED_PROFILE_DIR);
}

app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch("disable-features", "UseEcoQoSForBackgroundProcess");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("force-color-profile", "srgb");
// Wayland + Vulkan no son compatibles; desactivar Vulkan para usar OpenGL/ANGLE
app.commandLine.appendSwitch("disable-vulkan");

// El shell usa Electron castLabs (ECS) que incluye Widevine para DRM.
// No hace falta nada extra acá.

// El backend se resuelve desde una única fuente: CATODO_BACKEND_URL, o el
// host/puerto por defecto (CATODO_HOST/CATODO_PORT). El host/puerto solo se
// usan para el probe de autodetección HTTPS y como default cuando no hay
// override.
const BACKEND_HOST = process.env.CATODO_HOST || "127.0.0.1";
const BACKEND_PORT = process.env.CATODO_PORT || "8765";
const BACKEND_URL_OVERRIDE = process.env.CATODO_BACKEND_URL || null;

// Auto-detección: si el backend sirve HTTPS (self-signed, necesario para /cast
// y getDisplayMedia), la app se conecta por https e ignora el cert del kiosk.
const https = require("https");
function detectHttps() {
  if (BACKEND_URL_OVERRIDE) {
    return Promise.resolve(/^https:/.test(BACKEND_URL_OVERRIDE));
  }
  return new Promise((resolve) => {
    const req = https.get(
      `https://${BACKEND_HOST}:${BACKEND_PORT}/api/health`,
      { rejectUnauthorized: false, timeout: 2000 },
      () => { req.destroy(); resolve(true); }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}
// Se asigna tras detectHttps(): "http(s)://host:port" sin barra final.
let BACKEND_URL = null;

// Icono de la aplicación
const APP_ICON = path.join(__dirname, "..", "..", "catodo.png");

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Webview activo (YouTube/TV). Las teclas media del OS no llegan a la interfaz
// TV dentro del webview, así que se inyectan acá con sendInputEvent.
let activeWebview = null;

// Reproducción o interacción dentro del webview cuenta como actividad: se
// avisa al backend para que no active el screensaver mientras hay contenido
// sonando o el usuario usa el canal web con mouse/teclado.
const ACTIVITY_POLL_MS = 5000;
const WEBVIEW_ACTIVITY_QUERY = `(() => {
  const els = document.querySelectorAll('video, audio');
  for (const el of els) {
    if (!el.paused && !el.ended && el.readyState >= 2) return true;
  }
  return (Date.now() - (window.__catodoLastInput || 0)) < 10000;
})()`;

function reportWebviewActivity() {
  try {
    postToBackend("/api/activity", "{}");
  } catch (e) {
    fs.appendFileSync("/tmp/catodo-dev.log", "\n[ACT-ERR] " + e + "\n");
  }
}

// POST JSON al backend usando el módulo http/https según el scheme de
// BACKEND_URL. Usado por el poller de actividad y la notificación de
// navegación de los webviews.
function postToBackend(apiPath, body) {
  const url = new URL(apiPath, BACKEND_URL);
  const mod = url.protocol === "https:" ? https : http;
  const req = mod.request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  });
  req.on("error", () => {});
  req.write(body);
  req.end();
}

setInterval(() => {
  if (!activeWebview || activeWebview.isDestroyed()) return;
  activeWebview
    .executeJavaScript(WEBVIEW_ACTIVITY_QUERY, true)
    .then((active) => {
      if (active) reportWebviewActivity();
    })
    .catch(() => {});
}, ACTIVITY_POLL_MS);

const MEDIA_KEY_MAP = {
  playpause: "MediaPlayPause",
  next: "MediaNextTrack",
  prev: "MediaPreviousTrack",
  stop: "MediaStop",
  rewind: "MediaRewind",
  forward: "MediaFastForward",
  back: "BrowserBack",
  homepage: "Home",
  // teclas "web" que entienden los players HTML5 (ej. Movistar)
  space: "Space",
  enter: "Enter",
  arrowleft: "ArrowLeft",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowright: "ArrowRight",
};

function patchNavigator(contents) {
  contents.on("dom-ready", () => {
    contents
      .executeJavaScript(
        `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
         Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en','es'] });
         Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });`,
        true,
      )
      .catch(() => {});
  });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    fullscreen: true,
    frame: false,
    kiosk: true,
    backgroundColor: "#000",
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.setFocusable(true);
  win.setMenu(null);
  win.focus();
  win.webContents.setUserAgent(CHROME_UA);
  patchNavigator(win.webContents);

  win.loadURL(BACKEND_URL);

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[catodo] failed to load ${url}: ${desc} (${code})`);
  });

  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  // Reenviar teclas de los webviews a la ventana principal para que los
  // hotkeys 1-6/F11/Esc sigan funcionando mientras el webview tiene foco.
  // Los dígitos solo se reenvían cuando el webview NO tiene un campo editable
  // enfocado: así un código/contraseña se puede tipear sin cambiar de canal.
  const forwardKey = (input) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: input.key });
    win.webContents.sendInputEvent({ type: "char", keyCode: input.key });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: input.key });
  };
  const forwardKeys = (contents) => {
    const trackEditable = () => {
      contents
        .executeJavaScript(
          `(() => {
            const isEditable = () => {
              const el = document.activeElement;
              return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
            };
            window.__catodoEditable = isEditable();
            document.addEventListener("focusin", () => { window.__catodoEditable = isEditable(); });
            document.addEventListener("focusout", () => { window.__catodoEditable = isEditable(); });
          })()`
        )
        .catch(() => {});
    };
    contents.on("dom-ready", trackEditable);

    contents.on("before-input-event", (event, input) => {
      try {
        if (input.type !== "keyDown") return;
        if (input.key === "F11" || input.key === "Escape") {
          event.preventDefault();
          forwardKey(input);
        } else if (/^[1-6]$/.test(input.key)) {
          // No hacer preventDefault: si es editable, la tecla tipea normal en el
          // webview. Si NO es editable, se reenvía para cambiar de canal.
          contents
            .executeJavaScript("window.__catodoEditable === false")
            .then((notEditable) => { if (notEditable) forwardKey(input); })
            .catch(() => {});
        }
      } catch (e) {
        fs.appendFileSync("/tmp/catodo-dev.log", "\n[KEY-ERR] " + e + "\n");
      }
    });
  };
  win.webContents.on("did-attach-webview", (_e, contents) => {
    try {
      activeWebview = contents;
      contents.on("destroyed", () => {
        if (activeWebview === contents) activeWebview = null;
      });
      forwardKeys(contents);
      // Marcar la última interacción (mouse/teclado/touch) dentro del guest para
      // que el poller de actividad detecte uso del canal web.
      const trackInput = () => {
        contents
          .executeJavaScript(`(() => {
            window.__catodoLastInput = Date.now();
            const mark = () => { window.__catodoLastInput = Date.now(); };
            window.addEventListener('mousemove', mark, true);
            window.addEventListener('mousedown', mark, true);
            window.addEventListener('touchstart', mark, true);
            window.addEventListener('keydown', mark, true);
          })()`)
          .catch(() => {});
      };
      contents.on("dom-ready", trackInput);
      // El user-agent lo define el manifest del plugin vía el atributo del webview
      // (WebChannel). El canal se deduce del partition (persist:<id>) para notificar
      // la navegación al canal correcto.
      const channelId = (() => {
        try {
          const prefs = contents.getLastWebPreferences();
          return (prefs?.partition || "").replace(/^persist:/, "");
        } catch {
          return "";
        }
      })();
      if (channelId) {
        contents.on("did-navigate", (_ev, url) => {
          try {
            const body = JSON.stringify({ command: "navigate", url: url });
            postToBackend(`/api/channels/${channelId}/command`, body);
          } catch (e) {
            fs.appendFileSync("/tmp/catodo-dev.log", "\n[NAV-ERR] " + e + "\n");
          }
        });
      }
    } catch (e) {
      fs.appendFileSync("/tmp/catodo-dev.log", "\n[WV-ERR] " + e + "\n");
    }
  });
}

ipcMain.on("media-key", (_event, key) => {
  try {
    const code = MEDIA_KEY_MAP[key];
    if (!code || !activeWebview || activeWebview.isDestroyed()) return;
    activeWebview.sendInputEvent({ type: "keyDown", keyCode: code });
    activeWebview.sendInputEvent({ type: "keyUp", keyCode: code });
  } catch (e) {
    fs.appendFileSync("/tmp/catodo-dev.log", "\n[MEDIA-ERR] " + e + "\n");
  }
});

ipcMain.on("insert-text", (_event, text) => {
  try {
    if (!activeWebview || activeWebview.isDestroyed()) return;
    const parts = String(text ?? "").split(/(\{ENTER\}|\{BACKSPACE\})/);
    for (const part of parts) {
      if (!part) continue;
      if (part === "{ENTER}") {
        activeWebview.sendInputEvent({ type: "keyDown", keyCode: "Return" });
        activeWebview.sendInputEvent({ type: "char", keyCode: "\r" });
        activeWebview.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      } else if (part === "{BACKSPACE}") {
        activeWebview.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
        activeWebview.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
      } else {
        activeWebview.insertText(part);
      }
    }
  } catch (e) {
    fs.appendFileSync("/tmp/catodo-dev.log", "\n[INSERT-ERR] " + e + "\n");
  }
});

ipcMain.handle("open-login", async (_e, url) => {
  const auth = new BrowserWindow({
    width: 900,
    height: 700,
    title: "Cátodo — Login",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  auth.setMenu(null);
  auth.webContents.setUserAgent(CHROME_UA);
  patchNavigator(auth.webContents);
  await auth.loadURL(url);
  return true;
});

detectHttps().then((useHttps) => {
  BACKEND_URL =
    BACKEND_URL_OVERRIDE ||
    (useHttps ? `https://${BACKEND_HOST}:${BACKEND_PORT}` : `http://${BACKEND_HOST}:${BACKEND_PORT}`);
  app.whenReady().then(() => {
    if (useHttps) {
      // Aceptar el cert self-signed del kiosk en fetch, WS y el loadURL inicial.
      session.defaultSession.setCertificateVerifyProc((request, callback) => callback(0));
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
