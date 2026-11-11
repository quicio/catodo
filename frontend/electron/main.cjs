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

const { spawn } = require("child_process");
const { resolveBackend, freePort, waitForHealth } = require("./backend.cjs");
const https = require("https");

// Se asigna cuando el backend está listo: "http(s)://host:port" sin barra final.
let BACKEND_URL = null;
let backendProcess = null;
let backendLogStream = null;
let isQuitting = false;
let stoppingBackend = false;
let mainWindow = null;

function bundledBackendPath() {
  if (!app.isPackaged) return null;
  const candidate = path.join(process.resourcesPath, "backend", "catodo-backend");
  return fs.existsSync(candidate) ? candidate : null;
}

function backendErrorPage() {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Cátodo — sin backend</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; height: 100vh; display: grid; place-items: center;
      background: #080808; color: #e8e8e8;
      font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    main { max-width: 42rem; padding: 2rem; text-align: center; }
    h1 { font-size: 1.4rem; letter-spacing: .08em; text-transform: uppercase; }
    p { color: #9a9a9a; }
    button { margin-top: 1.5rem; padding: .7rem 1.4rem; border: 1px solid #555;
      background: #111; color: #eee; cursor: pointer; letter-spacing: .08em;
      text-transform: uppercase; }
    button:hover { border-color: #aaa; }
  </style>
</head>
<body>
  <main>
    <h1>Backend no disponible</h1>
    <p>Cátodo no pudo iniciar o encontrar el backend. Revisá los logs de la app
       y reintentá.</p>
    <button onclick="window.catodo && window.catodo.retryBackend()">Reintentar</button>
  </main>
</body>
</html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function scheduleBackendRetry(win) {
  if (win.__catodoRetryTimer) clearTimeout(win.__catodoRetryTimer);
  win.__catodoRetryTimer = setTimeout(() => {
    win.__catodoRetryTimer = null;
    if (!win.isDestroyed()) loadBackend(win);
  }, 5000);
}

function stopBundledBackend(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const child = backendProcess;
    if (!child || child.exitCode !== null) {
      backendProcess = null;
      if (backendLogStream) {
        backendLogStream.end();
        backendLogStream = null;
      }
      resolve();
      return;
    }
    stoppingBackend = true;
    backendProcess = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      stoppingBackend = false;
      if (backendLogStream) {
        backendLogStream.end();
        backendLogStream = null;
      }
      resolve();
    };
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      finish();
      return;
    }
    setTimeout(() => {
      if (!finished) {
        try { child.kill("SIGKILL"); } catch { /* ya terminó */ }
      }
    }, timeoutMs);
    setTimeout(finish, timeoutMs + 500);
  });
}

async function startBundledBackend() {
  const binary = bundledBackendPath();
  if (!binary) return null;

  if (backendProcess && backendProcess.exitCode === null) {
    if (BACKEND_URL && await waitForHealth(BACKEND_URL, 2000)) return BACKEND_URL;
    await stopBundledBackend(1000);
  }

  const port = await freePort();
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, "backend.log");
  backendLogStream = null;
  fs.appendFileSync(logPath, `\n=== ${new Date().toISOString()} starting ${binary} on 127.0.0.1:${port} ===\n`);

  const logFd = fs.openSync(logPath, "a");
  const backendRoot = path.dirname(binary);
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      CATODO_HOST: "127.0.0.1",
      CATODO_PORT: String(port),
      CATODO_STATIC_DIR: path.join(backendRoot, "static"),
      CATODO_PLUGINS_REPO: path.join(backendRoot, "plugins-repo"),
    },
    stdio: ["ignore", logFd, logFd],
  });
  fs.closeSync(logFd);
  backendProcess = child;

  child.on("spawn", () => {
    try {
      fs.appendFileSync(logPath, `=== spawned pid=${child.pid} ===\n`);
    } catch { /* best effort */ }
  });
  child.on("exit", (code, signal) => {
    if (backendProcess === child) backendProcess = null;
    if (!isQuitting) {
      try {
        fs.appendFileSync(logPath, `\n=== backend exited code=${code} signal=${signal} ===\n`);
      } catch { /* best effort */ }
      if (!stoppingBackend && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(backendErrorPage());
        scheduleBackendRetry(mainWindow);
      }
    }
  });
  child.on("error", (err) => {
    try {
      fs.appendFileSync(logPath, `\n=== backend spawn error: ${err} ===\n`);
    } catch { /* best effort */ }
  });

  const url = `http://127.0.0.1:${port}`;
  const healthy = await waitForHealth(url, 20000);
  if (!healthy) {
    await stopBundledBackend(1000);
    return null;
  }
  BACKEND_URL = url;
  return url;
}

async function loadBackend(win) {
  let resolved = null;
  const override = process.env.CATODO_BACKEND_URL || null;

  if (override) {
    resolved = {
      url: override.replace(/\/+$/, ""),
      useHttps: override.startsWith("https:"),
    };
  } else if (bundledBackendPath()) {
    const url = await startBundledBackend();
    if (url) resolved = { url, useHttps: false };
  } else {
    resolved = await resolveBackend({ packaged: app.isPackaged });
  }

  if (!resolved) {
    win.loadURL(backendErrorPage());
    scheduleBackendRetry(win);
    return;
  }
  if (win.__catodoRetryTimer) {
    clearTimeout(win.__catodoRetryTimer);
    win.__catodoRetryTimer = null;
  }
  BACKEND_URL = resolved.url;
  if (resolved.useHttps) {
    // Aceptar el cert self-signed del kiosk en fetch, WS y el loadURL inicial.
    session.defaultSession.setCertificateVerifyProc((request, callback) => callback(0));
  }
  win.loadURL(BACKEND_URL);
}

process.on("exit", () => {
  if (backendProcess && backendProcess.exitCode === null) {
    try { backendProcess.kill("SIGKILL"); } catch { /* best effort */ }
  }
});

// Icono de la aplicación
const APP_ICON = path.join(__dirname, "..", "..", "catodo.png");

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Webview activo (YouTube/TV). Las teclas media del OS no llegan a la interfaz
// TV dentro del webview, así que se inyectan acá con sendInputEvent.
// Con keep-alive conviven varios webviews (uno por canal visitado), así que se
// registran por channelId y activeWebview apunta al canal visible.
let activeWebview = null;
const webviewsByChannel = new Map();
let activeChannelId = null;

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
  if (!BACKEND_URL) return;
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
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.setFocusable(true);
  win.setMenu(null);
  win.focus();
  win.webContents.setUserAgent(CHROME_UA);
  patchNavigator(win.webContents);

  loadBackend(win);

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
      const channelId = (() => {
        try {
          const prefs = contents.getLastWebPreferences();
          return (prefs?.partition || "").replace(/^persist:/, "");
        } catch {
          return "";
        }
      })();
      if (channelId) {
        webviewsByChannel.set(channelId, contents);
        if (channelId === activeChannelId) activeWebview = contents;
        contents.on("destroyed", () => {
          webviewsByChannel.delete(channelId);
          if (activeWebview === contents) activeWebview = null;
        });
      }
      activeWebview = activeWebview || contents;
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

ipcMain.on("retry-backend", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    stopBundledBackend(1000).finally(() => loadBackend(win));
  }
});

ipcMain.on("set-active-channel", (_event, channelId) => {
  try {
    activeChannelId = channelId ? String(channelId) : null;
    const contents = activeChannelId ? webviewsByChannel.get(activeChannelId) : null;
    activeWebview = contents && !contents.isDestroyed() ? contents : null;
  } catch (e) {
    fs.appendFileSync("/tmp/catodo-dev.log", "\n[CH-ERR] " + e + "\n");
  }
});

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

app.on("before-quit", (event) => {
  if (isQuitting) return;
  if (!backendProcess) return;
  isQuitting = true;
  event.preventDefault();
  stopBundledBackend().finally(() => app.quit());
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
