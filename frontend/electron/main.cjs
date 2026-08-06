const { app, BrowserWindow, screen, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

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

const BACKEND_URL = process.env.CATODO_BACKEND_URL || "http://127.0.0.1:8765";

// Icono de la aplicación
const APP_ICON = path.join(__dirname, "..", "..", "catodo.png");

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

  // Reenviar teclas de los webviews (YouTube) a la ventana principal para que
  // los hotkeys 1-6/F11/Esc sigan funcionando mientras el webview tiene foco.
  const HOTKEYS = new Set(["1", "2", "3", "4", "5", "6", "F11", "Escape"]);
  // Ctrl+B en el webview → levantar la barra de canales (overlay)
  // User agent de Android TV para que youtube.com/tv sirva la interfaz TV
  const TV_UA =
    "Mozilla/5.0 (Linux; U; Android 10; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36";
  const forwardKeys = (contents) => {
    contents.on("before-input-event", (event, input) => {
      try {
        if (input.type !== "keyDown") return;
        if (HOTKEYS.has(input.key)) {
          event.preventDefault();
          win.webContents.sendInputEvent({ type: "keyDown", keyCode: input.key });
          win.webContents.sendInputEvent({ type: "char", keyCode: input.key });
          win.webContents.sendInputEvent({ type: "keyUp", keyCode: input.key });
        }
      } catch (e) {
        fs.appendFileSync("/tmp/catodo-dev.log", "\n[KEY-ERR] " + e + "\n");
      }
    });
  };
  win.webContents.on("did-attach-webview", (_e, contents) => {
    try {
      forwardKeys(contents);
      const setTvUa = (url) => {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          contents.setUserAgent(TV_UA);
        }
      };
      setTvUa(contents.getURL() || "");
      contents.on("did-start-navigation", (_ev, url) => setTvUa(url));
    } catch (e) {
      fs.appendFileSync("/tmp/catodo-dev.log", "\n[WV-ERR] " + e + "\n");
    }
  });
}

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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
