// Pairing: si llegamos con ?code= (QR), guardar y limpiar la URL
const codeParam = new URLSearchParams(location.search).get("code");
const justLinked = !!codeParam;
if (codeParam) {
  localStorage.setItem("catodo_token", codeParam);
  history.replaceState({}, "", location.pathname + location.hash);
}
const token = localStorage.getItem("catodo_token") || "";

function authHeaders(extra) {
  const h = { ...(extra || {}) };
  if (token) h["X-Catodo-Token"] = token;
  return h;
}

// Banner de bienvenida: si acabamos de vincular vía QR, mostramos un toast
// verde confirmando. Si llegamos sin token (instalación nueva, no escaneó
// QR), automáticamente abrimos el tab Ajustes para que tipee el código.
if (justLinked) {
  showStatus("✓ Vinculado a la TV", "ok");
} else if (!token && $("#view-settings")) {
  setTimeout(() => {
    showStatus("Escaneá el QR de la TV para vincular", "warn");
    switchTab("settings");
  }, 800);
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return proto + "//" + location.host + "/api/ws" + (token ? "?token=" + encodeURIComponent(token) : "");
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const artEl = $("#art");
const trackEl = $("#track");
const artistEl = $("#artist");
const playBtn = $("#playbtn");
const progressFill = $("#progress-fill");
const timeElapsed = $("#time-elapsed");
const timeTotal = $("#time-total");
const volSlider = $("#volslider");
const volLabel = $("#vollabel");
const muteBtn = $("#mute");
const statusEl = $("#status");
const transportEl = $("#transport");
const chGrid = $("#channels");
const progressBar = $("#progress-bar");
const timesRow = $("#times-row");
const castBar = $("#cast-bar");
const btnCastStop = $("#btn-cast-stop");

let channels = [];
let currentId = null;
let currentType = null;
let currentChannel = null;
let playing = false;
let lastVol = 50;
let trackPos = 0;
let trackDur = 0;
let trackStarted = 0;
let progressTimer = null;
let webFetchId = 0;
let hasLoaded = false;

const TRANSPORT_TYPES = new Set(["media", "app"]);
const CH_COLORS = { spotify: "#1db954", youtube: "#ff0033", anime: "#ffd166", tv: "#4d7cff", crunchyroll: "#f47521" };
// Colores de canal del tema activo (chSpotify → spotify, etc.); pisan CH_COLORS.
let themeChColors = {};

// --- Tema: el remote adopta paleta + radios del tema activo del TV ---
const SHAPE_PRESETS = { square: [0, 0, 2], rounded: [6, 10, 16], pill: [999, 999, 24] };
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function applyRemoteTheme(cfg) {
  if (!cfg || !Array.isArray(cfg.themes) || cfg.themes.length === 0) return;
  const t = cfg.themes.find((x) => x.id === cfg.theme)
    || cfg.themes.find((x) => x.id === "spotify-dark")
    || cfg.themes[0];
  if (!t) return;
  const root = document.documentElement;
  const colors = t.colors || t.tokens || {};
  for (const k in colors) root.style.setProperty("--" + kebab(k), colors[k]);
  themeChColors = {};
  for (const k in colors) {
    if (k.startsWith("ch")) themeChColors[k.slice(2).toLowerCase()] = colors[k];
  }
  const shape = (cfg.theme_overrides && cfg.theme_overrides.radius) || t.shape || "rounded";
  const [sm, md, lg] = SHAPE_PRESETS[shape] || SHAPE_PRESETS.rounded;
  root.style.setProperty("--radius-sm", sm + "px");
  root.style.setProperty("--radius-md", md + "px");
  root.style.setProperty("--radius-lg", lg + "px");
  root.style.setProperty("--radius", lg + "px");
  root.style.colorScheme = t.colorScheme === "light" ? "light" : "dark";
  if (channels.length) renderChannels(channels); // re-pintar --ch por botón
}

function loadRemoteTheme() {
  api("GET", "/api/config").then((cfg) => { if (cfg) applyRemoteTheme(cfg); });
}
const CH_SVG = {
  spotify: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  youtube: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect x="2" y="3" width="20" height="14" rx="2"/></svg>',
  anime: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  tv: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>',
  crunchyroll: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>',
  hbomax: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
  arcade: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="6" y2="13"/><line x1="8" y1="9" x2="8" y2="15"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="18" y1="10" x2="18" y2="14"/><line x1="17" y1="11" x2="19" y2="11"/><line x1="6" y1="6" x2="18" y2="6"/><path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 7 0 0 1-2 7H5a2 7 0 0 1-2-7Z"/><path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
  'screen-cast': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 10l3 3-3 3"/><path d="M12 16h5"/></svg>',
};
const CH_SVG_DEFAULT = {
  media: CH_SVG.spotify,
  web: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  app: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
  dashboard: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
};

// --- API ---

async function api(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  try {
    const r = await fetch(path, opts);
    if (r.status === 401) {
      const t = prompt("Código de acceso Cátodo:");
      if (t) { localStorage.setItem("catodo_token", t); location.reload(); }
      return null;
    }
    if (!r.ok) return null;
    if (r.headers.get("content-type")?.includes("application/json")) return r.json();
    return null;
  } catch (e) { return null; }
}

// --- Views ---

function switchTab(name) {
  $$(".view").forEach(v => v.classList.remove("active"));
  $$(".tab-btn").forEach(b => b.classList.remove("active"));
  const view = $("#view-" + name);
  const tabBtn = document.querySelector(`[data-tab="${name}"]`);
  if (view) view.classList.add("active");
  if (tabBtn) tabBtn.classList.add("active");
}

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.classList.remove("ok", "warn", "error");
  if (type) statusEl.classList.add(type);
  statusEl.classList.add("visible");
  clearTimeout(statusEl._timeout);
  statusEl._timeout = setTimeout(() => statusEl.classList.remove("visible"), 2500);
}

// --- Channels ---

function channelById(id) { return channels.find(c => c.id === id); }

function renderChannels(list) {
  channels = list;
  chGrid.innerHTML = "";
  for (const ch of list) {
    const i = channels.indexOf(ch);
    const color = ch.color || themeChColors[ch.id] || CH_COLORS[ch.id] || "#ffffff";
    const icon = CH_SVG[ch.id] || CH_SVG_DEFAULT[ch.type] || "";
    const btn = document.createElement("button");
    btn.dataset.id = ch.id;
    btn.dataset.type = ch.type;
    btn.dataset.name = (ch.name || "").toLowerCase();
    btn.style.setProperty("--ch", color);
    btn.innerHTML = `
      <span class="ch-badge">${icon}</span>
      <span class="ch-name">${ch.name}</span>
      <span class="ch-num">CH ${String(i + 1).padStart(2, "0")}</span>`;
    if (ch.id === currentId) btn.classList.add("active");
    btn.onclick = () => api("POST", "/api/channels/" + ch.id + "/open");
    chGrid.appendChild(btn);
  }
  applyChannelFilter();
}

// Wire up the search input
(function initChannelSearch() {
  const search = $("#channel-search");
  if (!search) return;
  search.addEventListener("input", applyChannelFilter);
  search.addEventListener("search", applyChannelFilter); // clear button
})();

function applyChannelFilter() {
  const q = ($("#channel-search")?.value || "").trim().toLowerCase();
  let visible = 0;
  for (const btn of chGrid.children) {
    const match = !q || (btn.dataset.name || "").includes(q);
    btn.style.display = match ? "" : "none";
    if (match) visible++;
  }
  const empty = $("#channels-empty");
  if (empty) {
    empty.style.display = (q && visible === 0) ? "block" : "none";
    const qSpan = $("#channels-empty-q");
    if (qSpan) qSpan.textContent = q;
  }
}

function onOpen(id, silent) {
  currentId = id;
  webFetchId++;
  const ch = channelById(id);
  currentType = ch ? ch.type : null;
  currentChannel = ch || null;
  for (const btn of chGrid.children) btn.classList.toggle("active", btn.dataset.id === id);
  updateNowPlayingView();
  if (ch && ch.type === "web") {
    const fid = webFetchId;
    api("GET", "/api/channels/" + id + "/state").then(s => {
      if (s && webFetchId === fid) showWebChannel(s);
    });
  }
  if (silent) return;
  if (ch && ch.type === "web") switchTab("channels");
  else if (TRANSPORT_TYPES.has(currentType || "")) switchTab("now");
}

function showWebChannel(state) {
  const name = channelById(state.id)?.name || state.id;
  trackEl.textContent = name;
  artistEl.textContent = state.url || "";
  artEl.removeAttribute("src");
  stopProgress();
  progressBar.style.display = "none";
  timesRow.style.display = "none";
  transportEl.style.display = "";
  transportEl.innerHTML = `<button id="btn-launch" class="ctrl-btn" style="width:auto;padding:0 24px;border-radius:24px;font-size:14px;font-weight:600">🌐 Abrir en navegador</button>`;
  document.getElementById("btn-launch").onclick = () => {
    api("POST", "/api/channels/" + state.id + "/command", { command: "launch" });
    showStatus("Abriendo " + name + "…");
  };
}

function updateNowPlayingView() {
  const ch = channelById(currentId);
  const isWeb = ch && ch.type === "web";
  const showTransport = TRANSPORT_TYPES.has(currentType || "");
  if (!isWeb) {
    transportEl.innerHTML = `
      <button data-cmd="prev" class="ctrl-btn" aria-label="Anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg></button>
      <button data-cmd="toggle" id="playbtn" class="ctrl-btn primary" aria-label="Play/Pause"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
      <button data-cmd="next" class="ctrl-btn" aria-label="Siguiente"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zm-11-7 8.5 6V6z"/></svg></button>
    `;
    progressBar.style.display = showTransport ? "" : "none";
    timesRow.style.display = showTransport ? "" : "none";
  }
  transportEl.style.display = (showTransport || isWeb) ? "" : "none";
  if (!showTransport && !isWeb) {
    trackEl.textContent = "Sin reproducción";
    artistEl.textContent = "Abrí Spotify para empezar";
    artEl.removeAttribute("src");
    stopProgress();
  }
}

// --- Now Playing ---

function onTrack(data) {
  if (!TRANSPORT_TYPES.has(currentType || "")) return;
  progressBar.style.display = "";
  timesRow.style.display = "";
  trackEl.textContent = data.title || "Sin título";
  artistEl.textContent = data.artist || "";
  if (data.art_url) { artEl.src = data.art_url; } else { artEl.removeAttribute("src"); }
  const btn = document.getElementById("playbtn");
  const icon = btn ? btn.querySelector("svg") : null;
  if (data.status === "Playing") {
    playing = true;
    if (icon) icon.innerHTML = '<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>';
  } else {
    playing = false;
    if (icon) icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  }
  if (typeof data.position === "number" && data.position > 0) {
    trackPos = data.position; trackStarted = Date.now();
    startProgress();
  }
}

function startProgress() {
  stopProgress();
  progressTimer = setInterval(() => {
    if (!playing || trackDur <= 0) return;
    const elapsed = trackPos + (Date.now() - trackStarted) / 1000;
    const pct = Math.min(100, (elapsed / trackDur) * 100);
    progressFill.style.width = pct + "%";
    timeElapsed.textContent = fmtTime(elapsed);
    timeTotal.textContent = fmtTime(trackDur);
  }, 200);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressFill.style.width = "0%";
  timeElapsed.textContent = "0:00";
  timeTotal.textContent = "0:00";
}

function fmtTime(s) { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s/60); const sec = Math.floor(s%60); return m + ":" + String(sec).padStart(2,"0"); }

// --- Volume ---

function onVolume(v) {
  volSlider.value = v;
  volLabel.textContent = v;
  lastVol = v;
  const svg = muteBtn.querySelector("svg");
  if (svg) {
    if (v === 0) svg.innerHTML = '<path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    else svg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.47 4.47 0 0 0 2.5-3.5zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
}

// --- Mouse Trackpad ---

const trackpad = $("#trackpad");
const cursor = $("#cursor");
const scrollstrip = $("#scrollstrip");
const scrollThumb = $("#scroll-thumb");
const btnBack = $("#btn-back");
const btnLeft = $("#btn-left");
const btnRight = $("#btn-right");

const TAP_TIMEOUT = 500;
const TAP_DISTANCE = 12;
const MOVE_THRESHOLD = 8;
const CURSOR_OFFSET = 30;
const SCROLL_STEP = 10;

let gesture = null;
let scrollGesture = null;
let scrollAccum = 0;

function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

function showCursor() {
  if (!cursor) return;
  cursor.style.opacity = "1";
  clearTimeout(showCursor._t);
  showCursor._t = setTimeout(() => { cursor.style.opacity = "0"; }, 1200);
}

function placeCursor(clientX, clientY) {
  if (!cursor) return;
  const r = trackpad.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - r.left, 12), r.width - 12);
  const y = Math.min(Math.max(clientY - r.top - CURSOR_OFFSET, 12), r.height - 12);
  cursor.style.left = x + "px";
  cursor.style.top = y + "px";
  showCursor();
}

function moveCursor(dx, dy) {
  if (!cursor) return;
  const r = trackpad.getBoundingClientRect();
  const x = Math.min(Math.max((parseFloat(cursor.style.left) || r.width / 2) + dx, 12), r.width - 12);
  const y = Math.min(Math.max((parseFloat(cursor.style.top) || r.height / 2) + dy, 12), r.height - 12);
  cursor.style.left = x + "px";
  cursor.style.top = y + "px";
  showCursor();
}

function doClick(button) {
  vibrate(14);
  if (cursor) {
    cursor.classList.remove("pop");
    void cursor.offsetWidth;
    cursor.classList.add("pop");
  }
  api("POST", "/api/mouse/click", { button });
}

function moveThumb(clientY) {
  if (!scrollThumb) return;
  const r = scrollstrip.getBoundingClientRect();
  const y = Math.min(Math.max(clientY - r.top, 24), r.height - 24);
  scrollThumb.style.top = y + "px";
}

if (trackpad) {
  trackpad.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    placeCursor(t.clientX, t.clientY);
    if (!gesture) {
      gesture = {
        fingers: e.touches.length,
        startX: t.clientX, startY: t.clientY,
        lastX: t.clientX, lastY: t.clientY,
        time: Date.now(), moved: false,
      };
    } else {
      gesture.fingers = Math.max(gesture.fingers, e.touches.length);
    }
  }, { passive: false });

  trackpad.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!gesture || gesture.fingers > 1) return;
    const t = e.touches[0];
    const dx = t.clientX - gesture.lastX;
    const dy = t.clientY - gesture.lastY;
    gesture.lastX = t.clientX; gesture.lastY = t.clientY;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY) > MOVE_THRESHOLD) gesture.moved = true;
    moveCursor(dx, dy);
    api("POST", "/api/mouse/move", { dx: Math.round(dx * 2), dy: Math.round(dy * 2) });
  }, { passive: false });

  trackpad.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (!gesture) return;
    gesture.fingers = Math.max(gesture.fingers, e.touches.length);
    if (e.touches.length > 0) return;
    const t = e.changedTouches[0];
    const elapsed = Date.now() - gesture.time;
    const travel = Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY);
    if (!gesture.moved && elapsed <= TAP_TIMEOUT && travel <= TAP_DISTANCE) {
      doClick(gesture.fingers <= 1 ? 1 : 3);
    }
    gesture = null;
  }, { passive: false });

  trackpad.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    gesture = null;
  }, { passive: false });
}

// --- Scroll strip ---

if (scrollstrip) {
  scrollstrip.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    scrollGesture = { lastY: e.touches[0].clientY };
    scrollAccum = 0;
    scrollstrip.classList.add("active");
    moveThumb(e.touches[0].clientY);
  }, { passive: false });

  scrollstrip.addEventListener("touchmove", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!scrollGesture) return;
    const t = e.touches[0];
    const dy = t.clientY - scrollGesture.lastY;
    scrollGesture.lastY = t.clientY;
    scrollAccum += dy;
    const steps = Math.trunc(scrollAccum / SCROLL_STEP);
    if (steps) {
      api("POST", "/api/mouse/scroll", { dy: -steps });
      scrollAccum -= steps * SCROLL_STEP;
      vibrate(8);
    }
    moveThumb(t.clientY);
  }, { passive: false });

  const endScroll = (e) => {
    e.preventDefault();
    scrollGesture = null;
    scrollstrip.classList.remove("active");
  };
  scrollstrip.addEventListener("touchend", endScroll, { passive: false });
  scrollstrip.addEventListener("touchcancel", endScroll, { passive: false });
}

// --- Mouse action buttons ---

if (btnBack) btnBack.addEventListener("click", () => { vibrate(10); api("POST", "/api/mouse/key", { key: "esc" }); });
if (btnLeft) btnLeft.addEventListener("click", () => doClick(1));
if (btnRight) btnRight.addEventListener("click", () => doClick(3));

// --- Buscar en el canal activo (usa el teclado nativo del celu) ---
(function searchInit() {
  const input = $("#search-input");
  const btn = $("#search-send");
  if (!input) return;
  const doSearch = () => {
    const q = input.value.trim();
    if (!q) return;
    // Si el canal activo tiene search_url en su manifest (ej. YouTube),
    // mandamos un comando específico que el backend traduce a una
    // navegación al search URL del plugin. Si no, caemos al fallback
    // /api/type que inyecta texto en el webview (útil para inputs nativos).
    if (currentId && currentChannel?.search_url) {
      api("POST", "/api/channels/" + currentId + "/command", {
        command: "search",
        query: q,
      });
    } else {
      api("POST", "/api/type", { text: q + "{ENTER}" });
    }
    vibrate(10);
    input.value = "";
    input.blur(); // cerrar el teclado nativo del celu
  };
  if (btn) btn.addEventListener("click", doSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
})();

function bindHoldRepeat(el, fire) {
  let timer = null, fast = null;
  const down = (e) => {
    e.preventDefault();
    fire();
    timer = setTimeout(() => { fast = setInterval(fire, 100); }, 420);
  };
  const up = () => { clearTimeout(timer); clearInterval(fast); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
}

// --- Multimedia keys ---

const MEDIA_SVG = {
  rewind: '<polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>',
  prev: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
  playpause: '<polygon points="6 3 20 12 6 21 6 3"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>',
  next: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  forward: '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  voldown: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  volup: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  homepage: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
};
const MEDIA_ROW_1 = ["rewind", "prev", "playpause", "next", "forward", "stop"];
const MEDIA_ROW_2 = ["voldown", "volup", "mute", "back", "homepage", "power"];
const MEDIA_REPEAT = new Set(["rewind", "forward", "voldown", "volup"]);

function renderMediaRow(containerId, keys) {
  const c = $(containerId);
  if (!c) return;
  for (const name of keys) {
    const b = document.createElement("button");
    b.className = "key media";
    b.setAttribute("aria-label", name);
    b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MEDIA_SVG[name]}</svg>`;
    if (MEDIA_REPEAT.has(name)) bindHoldRepeat(b, () => sendKey(name));
    else b.addEventListener("click", () => sendKey(name));
    c.appendChild(b);
  }
}
renderMediaRow("#media-row-1", MEDIA_ROW_1);
renderMediaRow("#media-row-2", MEDIA_ROW_2);

// --- Settings ---

const settingsPlugins = $("#settings-plugins");
const pluginIdInput = $("#plugin-id-input");
const btnPluginInstall = $("#btn-plugin-install");
const repoInput = $("#repo-input");
const btnRepoSave = $("#btn-repo-save");
const settingsInfo = $("#settings-info");
const settingsLibraries = $("#settings-libraries");
const libIdInput = $("#lib-id-input");
const libNameInput = $("#lib-name-input");
const libPathInput = $("#lib-path-input");
const libKindInput = $("#lib-kind-input");
const btnLibraryAdd = $("#btn-library-add");
const idleScreensaverInput = $("#idle-screensaver-input");
const idleSleepInput = $("#idle-sleep-input");
const btnIdleSave = $("#btn-idle-save");
const tokenInput = $("#token-input");
const btnTokenSave = $("#btn-token-save");

function loadSettingsPlugins() {
  api("GET", "/api/plugins").then((list) => {
    if (!settingsPlugins) return;
    settingsPlugins.innerHTML = "";
    if (!list || list.length === 0) {
      settingsPlugins.innerHTML = '<div class="settings-empty">Sin plugins instalados.</div>';
      return;
    }
    for (const p of list) {
      const row = document.createElement("div");
      row.className = "plugin-row";
      row.innerHTML = `
        <div class="plugin-info">
          <div class="plugin-name">${esc(p.name || p.id)}</div>
          <div class="plugin-meta">${esc(p.id)} · v${esc(p.version)} · ${esc(p.origin)}</div>
        </div>
        <label class="switch" aria-label="Habilitar ${esc(p.id)}">
          <input type="checkbox" data-pid="${esc(p.id)}" ${p.enabled ? "checked" : ""}>
          <span class="switch-slider"></span>
        </label>`;
      row.querySelector("input").addEventListener("change", (e) => {
        const on = e.target.checked;
        api("POST", `/api/plugins/${p.id}/${on ? "enable" : "disable"}`).then(() => loadSettingsPlugins());
      });
      settingsPlugins.appendChild(row);
    }
  });
}

function loadSettingsRepo() {
  api("GET", "/api/config").then((cfg) => {
    if (repoInput && cfg) repoInput.value = cfg.plugin_repo || "";
    if (idleScreensaverInput && cfg) idleScreensaverInput.value = cfg.idle_screensaver_seconds ?? 240;
    if (idleSleepInput && cfg) idleSleepInput.value = cfg.idle_sleep_seconds ?? 0;
  });
}

function loadSettingsInfo() {
  if (settingsInfo) settingsInfo.innerHTML = `Remote sirviendo desde <span class="mono">${location.host}</span>`;
  const hostEl = $("#pair-host");
  if (hostEl) hostEl.textContent = location.host;
  if (tokenInput) tokenInput.value = token || "";
}

if (btnTokenSave) {
  btnTokenSave.addEventListener("click", () => {
    const t = (tokenInput.value || "").trim();
    if (t) localStorage.setItem("catodo_token", t);
    else localStorage.removeItem("catodo_token");
    showStatus("Código guardado — recargando");
    setTimeout(() => location.reload(), 400);
  });
}

if (btnIdleSave) {
  btnIdleSave.addEventListener("click", async () => {
    await api("POST", "/api/config", {
      idle_screensaver_seconds: Number(idleScreensaverInput.value || 0),
      idle_sleep_seconds: Number(idleSleepInput.value || 0),
    });
    showStatus("Reposo guardado");
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

if (btnPluginInstall) btnPluginInstall.addEventListener("click", async () => {
  const id = (pluginIdInput.value || "").trim();
  if (!id) return;
  showStatus("Instalando " + id + "…");
  const r = await api("POST", "/api/plugins/install", { id });
  showStatus(r ? "Instalado: " + id : "No se pudo instalar " + id);
  loadSettingsPlugins();
});

if (btnRepoSave) btnRepoSave.addEventListener("click", async () => {
  const repo = (repoInput.value || "").trim();
  await api("POST", "/api/config", { plugin_repo: repo });
  showStatus("Repo guardado");
});

function loadSettingsLibraries() {
  api("GET", "/api/libraries").then((list) => {
    if (!settingsLibraries) return;
    settingsLibraries.innerHTML = "";
    if (!list || list.length === 0) {
      settingsLibraries.innerHTML = '<div class="settings-empty">Sin bibliotecas.</div>';
      return;
    }
    for (const lib of list) {
      const row = document.createElement("div");
      row.className = "plugin-row";
      row.innerHTML = `
        <div class="plugin-info">
          <div class="plugin-name">${esc(lib.name)}</div>
          <div class="plugin-meta">${esc(lib.id)} · ${esc(lib.kind)} · ${esc(lib.path)}</div>
        </div>
        ${lib.builtin ? "" : `<button class="settings-btn" data-lib="${esc(lib.id)}">Quitar</button>`}`;
      const btn = row.querySelector("[data-lib]");
      if (btn) {
        btn.addEventListener("click", async () => {
          await api("DELETE", "/api/libraries/" + lib.id);
          loadSettingsLibraries();
        });
      }
      settingsLibraries.appendChild(row);
    }
  });
}

if (btnLibraryAdd) {
  btnLibraryAdd.addEventListener("click", async () => {
    const id = (libIdInput.value || "").trim().toLowerCase().replace(/\s+/g, "-");
    const name = (libNameInput.value || id || "").trim();
    const path = (libPathInput.value || "").trim();
    const kind = libKindInput.value || "series";
    if (!id || !path) {
      showStatus("Completá id y carpeta");
      return;
    }
    const r = await api("POST", "/api/libraries", { id, name, path, kind });
    showStatus(r ? "Biblioteca agregada" : "No se pudo agregar");
    libIdInput.value = "";
    libNameInput.value = "";
    libPathInput.value = "";
    loadSettingsLibraries();
  });
}

loadSettingsPlugins();
loadSettingsLibraries();
loadSettingsRepo();
loadSettingsInfo();

// --- Events ---

function handleEvent(evt) {
  switch (evt.event) {
    case "state_snapshot":
      renderChannels(evt.available_channels || []);
      currentId = evt.current_channel_id || null;
      onOpen(currentId, !hasLoaded);
      hasLoaded = true;
      onVolume(evt.volume || 50);
      { const ch = evt.channels?.spotify; if (ch && ch.title) { trackDur = ch.duration || 0; onTrack(ch); } }
      break;
    case "channel_changed": onOpen(evt.channel_id); stopProgress(); break;
    case "channel_closed": currentId = null; currentType = null; updateNowPlayingView(); stopProgress(); break;
    case "volume_changed": onVolume(evt.volume); break;
    case "track_changed": onTrack(evt); break;
    case "playback_status_changed": onTrack(evt); break;
    case "cast_session_started": showCast(true, evt.source); break;
    case "cast_session_ended": showCast(false); break;
    case "config_changed":
      if (["theme", "themes", "theme_overrides"].includes(evt.key)) loadRemoteTheme();
      break;
  }
}

function showCast(on, source) {
  if (!castBar) return;
  castBar.classList.toggle("visible", !!on);
  if (on) castBar.querySelector(".cast-source").textContent = source || "Dispositivo";
}

if (btnCastStop) {
  btnCastStop.addEventListener("click", () => {
    api("POST", "/api/cast/stop");
    showCast(false);
  });
}

// --- WebSocket ---

function connectWs() {
  const ws = new WebSocket(wsUrl());
  ws.onmessage = (m) => { try { handleEvent(JSON.parse(m.data)); } catch (e) {} };
  ws.onclose = () => { showStatus("Reconectando…"); setTimeout(connectWd, 2000); };
  ws.onopen = () => { showStatus("Conectado"); };
  ws.onerror = () => ws.close();
}
function connectWd() { connectWs(); }

// --- UI Handlers ---

$$(".tab-btn").forEach(btn => { btn.onclick = () => switchTab(btn.dataset.tab); });

transportEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cmd]");
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  if (!cmd || !currentId || !TRANSPORT_TYPES.has(currentType || "")) return;
  api("POST", "/api/channels/" + currentId + "/command", { command: cmd });
});

volSlider.oninput = () => { onVolume(Number(volSlider.value)); api("POST", "/api/volume?level=" + volSlider.value); };

muteBtn.onclick = () => {
  if (volSlider.value > 0) { lastVol = Number(volSlider.value); volSlider.value = 0; }
  else { volSlider.value = lastVol; }
  onVolume(Number(volSlider.value));
  api("POST", "/api/volume?level=" + volSlider.value);
};

(async () => {
  const list = await api("GET", "/api/channels");
  if (list) renderChannels(list);
  loadRemoteTheme();
  connectWs();
})();

// ---------------------------------------------------------------------------
// PWA: service worker + install banner.
// ---------------------------------------------------------------------------
(function setupPWA() {
  if (!("serviceWorker" in navigator)) return;

  // Register the SW scoped to /remote/. The Electron kiosko loads `/` and
  // never registers a SW — we don't want stale cache breaking deploys.
  navigator.serviceWorker
    .register("/remote/sw.js", { scope: "/remote/" })
    .catch((e) => console.warn("SW register failed", e));

  // Install banner (Chrome/Edge Android + desktop).
  let deferredPrompt = null;
  const dismissed = localStorage.getItem("catodo_install_dismissed") === "1";
  if (dismissed) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.getElementById("catodo-install-banner")) return;
    const bar = document.createElement("div");
    bar.id = "catodo-install-banner";
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:64px;z-index:1000;" +
      "background:var(--surface,#1a1a1a);color:var(--text,#f0f0f0);" +
      "border:1px solid var(--border,#333);border-radius:10px;" +
      "padding:10px 12px;font-size:13px;display:flex;gap:8px;align-items:center;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.5)";
    bar.innerHTML =
      '<span style="flex:1">¿Instalar Cátodo Remote como app?</span>' +
      '<button id="catodo-install-go" style="background:var(--accent,#1db954);color:#000;border:0;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer">Instalar</button>' +
      '<button id="catodo-install-no" style="background:transparent;color:var(--text-dim,#999);border:1px solid var(--border,#333);border-radius:6px;padding:6px 10px;cursor:pointer">Más tarde</button>';
    document.body.appendChild(bar);
    bar.querySelector("#catodo-install-go").onclick = async () => {
      bar.remove();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
    };
    bar.querySelector("#catodo-install-no").onclick = () => {
      bar.remove();
      localStorage.setItem("catodo_install_dismissed", "1");
    };
  }
})();
