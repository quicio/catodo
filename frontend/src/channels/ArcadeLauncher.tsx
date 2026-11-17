import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { api, type AppState } from "../api/client";
import MonitorControls from "../components/MonitorControls";
import { setGamepadNavSuspended } from "../gamepad/useGamepadNav";
import ArcadeCanvas, { type ArcadeShader } from "./ArcadeCanvas";
import ArcadeAudio from "./ArcadeAudio";

interface ArcadeGame {
  name: string;
  rom: string;
  boxart: string | null;
  rel: string;
  system: string;
}

interface ArcadeSystem {
  name: string;
  games: ArcadeGame[];
}

interface ArcadeData {
  systems: ArcadeSystem[];
  current?: ArcadeGame | null;
  playing?: boolean;
  mode?: "embedded" | "external" | null;
  core?: string | null;
  fps?: number;
  aspect?: number;
  resolution?: [number, number];
  error?: string | null;
}

interface CartType {
  kind: "cart" | "jewel" | "marquee";
  ratio: number;
}

const CHANNEL = "arcade";
const CARD_W = 240;
// Separación entre fichas. El glow/efecto 3D necesita aire para no verse
// recortado contra las vecinas.
const GAP = 44;
// Alto aproximado de la etiqueta con el nombre del juego bajo el cartucho.
const LABEL_H = 28;

// Ratio (ancho/alto) real de las carátulas de SNES descargadas (~1.41). Se usa
// como fallback para los placeholders para que no desentonen con los juegos que
// sí tienen carátula.
const SNES_RATIO = 1.41;

// Forma/proporción de cartucho por sistema (ratio = ancho/alto, fallback sin boxart).
const CARTRIDGE_TYPES: Record<string, CartType> = {
  snes: { kind: "cart", ratio: SNES_RATIO },
  "super nintendo": { kind: "cart", ratio: SNES_RATIO },
  nes: { kind: "cart", ratio: 1.3 },
  nintendo: { kind: "cart", ratio: 1.3 },
  gb: { kind: "cart", ratio: 0.85 },
  "game boy": { kind: "cart", ratio: 0.85 },
  gbc: { kind: "cart", ratio: 0.85 },
  "game boy color": { kind: "cart", ratio: 0.85 },
  gba: { kind: "cart", ratio: 0.85 },
  "game boy advance": { kind: "cart", ratio: 0.85 },
  n64: { kind: "cart", ratio: 0.9 },
  genesis: { kind: "cart", ratio: 0.85 },
  md: { kind: "cart", ratio: 0.85 },
  megadrive: { kind: "cart", ratio: 0.85 },
  "mega drive": { kind: "cart", ratio: 0.85 },
  psx: { kind: "jewel", ratio: 1.0 },
  ps1: { kind: "jewel", ratio: 1.0 },
  playstation: { kind: "jewel", ratio: 1.0 },
  psp: { kind: "jewel", ratio: 1.0 },
  segacd: { kind: "jewel", ratio: 1.0 },
  saturn: { kind: "jewel", ratio: 1.0 },
  dreamcast: { kind: "jewel", ratio: 1.0 },
  mame: { kind: "marquee", ratio: 1.55 },
  arcade: { kind: "marquee", ratio: 1.55 },
};
const DEFAULT_CART: CartType = { kind: "cart", ratio: SNES_RATIO };
const cartTypeFor = (system: string) =>
  CARTRIDGE_TYPES[system.trim().toLowerCase()] ?? DEFAULT_CART;

const boxartUrl = (rel: string) => `/api/channels/${CHANNEL}/boxart?path=${encodeURIComponent(rel)}`;

export default function ArcadeLauncher({ state }: { state: AppState }) {
  const [data, setData] = useState<ArcadeData | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // El backend avisa cuando tiene que bajar el core del sistema. Sin esto, la
  // primera partida de cada consola parece colgada durante la descarga.
  useEffect(() => {
    let timer: number | null = null;
    const onDownload = (raw: Event) => {
      const detail = (raw as CustomEvent).detail as
        | { core?: string; system?: string; game?: string | null }
        | undefined;
      const core = detail?.core ?? "libretro";
      const system = detail?.system ? ` (${detail.system})` : "";
      setNotice(`Descargando core ${core}${system}…`);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 30_000);
    };
    window.addEventListener("catodo:arcade_core_download", onDownload);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("catodo:arcade_core_download", onDownload);
    };
  }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch(`/api/channels/${CHANNEL}/state`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ArcadeData | null) => {
        if (d) setData(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Debounce: el backend puede emitir `boxarts_synced` en ráfaga; agrupamos.
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load, state.arcade?.boxart_revision]);

  // Cada carátula descargada se parchea localmente en lugar de recargar el
  // estado completo (con SNES/PSX eran más de 1000 fichas por recarga).
  useEffect(() => {
    const onBoxart = (raw: Event) => {
      const rel = (raw as CustomEvent<{ rel?: string }>).detail?.rel;
      if (!rel) return;
      setData((prev) => {
        if (!prev) return prev;
        let changed = false;
        const systems = prev.systems.map((s) => {
          if (!s.games.some((g) => g.rel === rel)) return s;
          const games = s.games.map((g) => {
            if (g.rel !== rel || g.boxart) return g;
            changed = true;
            return { ...g, boxart: rel };
          });
          return changed ? { ...s, games } : s;
        });
        return changed ? { ...prev, systems } : prev;
      });
    };
    window.addEventListener("catodo:arcade_boxart", onBoxart);
    return () => window.removeEventListener("catodo:arcade_boxart", onBoxart);
  }, []);

  // Mientras hay una sesión embebida el estado cambia (fps, resolución, fin).
  useEffect(() => {
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [load]);

  const systems = useMemo(() => data?.systems ?? [], [data]);
  const activeSystem = useMemo(
    () => systems.find((s) => s.name === selectedSystem) ?? null,
    [systems, selectedSystem],
  );
  const items: ArcadeSystem[] | ArcadeGame[] = activeSystem ? activeSystem.games : systems;
  const isGamesLevel = !!activeSystem;
  const embedded = data?.mode === "embedded" && data.playing === true;

  // Viewport del scroll para virtualizar la grilla de juegos (SNES/PSX llegan a
  // 1000+ fichas): solo se montan las filas visibles (+ un margen de overscan).
  const [viewport, setViewport] = useState({ width: 1920, height: 800, scrollTop: 0 });
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      if (!el.isConnected) return;
      setViewport((v) => {
        const nv = { width: el.clientWidth, height: el.clientHeight, scrollTop: el.scrollTop };
        return nv.width === v.width && nv.height === v.height && nv.scrollTop === v.scrollTop
          ? v
          : nv;
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [embedded]);

  const PAD_X = 32;
  const innerW = Math.max(320, viewport.width - PAD_X * 2);
  const columns = Math.max(1, Math.floor((innerW + GAP) / (CARD_W + GAP)));
  const cardWidth = Math.max(80, Math.floor((innerW - (columns - 1) * GAP) / columns));
  // Ratio uniforme por sistema → todas las filas tienen el mismo alto.
  const activeRatio = cartTypeFor(activeSystem?.name ?? "").ratio;
  const rowH = Math.round(cardWidth / activeRatio) + LABEL_H + GAP;

  const totalRows = isGamesLevel ? Math.ceil(items.length / columns) : 0;
  const startRow = isGamesLevel ? Math.max(0, Math.floor(viewport.scrollTop / rowH) - 2) : 0;
  const endRow = isGamesLevel
    ? Math.min(totalRows, Math.ceil((viewport.scrollTop + viewport.height) / rowH) + 2)
    : 0;
  const startIdx = startRow * columns;
  const endIdx = Math.min(items.length, endRow * columns);
  const gamesWindow = isGamesLevel ? activeSystem!.games.slice(startIdx, endIdx) : [];

  const launch = useCallback(
    (rel: string) => {
      api.command(CHANNEL, "launch", { game: rel }).then(load).catch(() => {});
    },
    [load],
  );

  const selectSystem = useCallback((name: string) => {
    setFocused(0);
    setSelectedSystem(name);
  }, []);

  const focusCard = useCallback((idx: number) => setFocused(idx), []);

  // Refs para que el listener de teclado no se re-registre en cada movimiento
  // (con cientos de fichas, re-suscribir por paso causaba saltos/pérdidas).
  // Columnas efectivas de la grilla mostrada (los sistemas usan mínimo 2).
  const navColumns = isGamesLevel ? columns : Math.max(2, columns);
  const columnsRef = useRef(navColumns);
  columnsRef.current = navColumns;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const isGamesRef = useRef(isGamesLevel);
  isGamesRef.current = isGamesLevel;

  // Navegación con teclado/remote según nivel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const list = itemsRef.current;
      if (list.length === 0) return;
      const len = list.length;
      const cols = columnsRef.current;
      const cur = focusedRef.current;
      const row = Math.floor(cur / cols);
      const col = cur % cols;
      const move = (n: number) => {
        e.preventDefault();
        if (n >= 0 && n < len) setFocused(n);
      };
      // Grilla: sin wrap-around. En la primera/última columna izquierda/derecha
      // no salta al otro extremo (eso se veía como "izquierda va a la derecha").
      if (e.key === "ArrowLeft") move(col > 0 ? cur - 1 : cur);
      else if (e.key === "ArrowRight") move(col < cols - 1 ? cur + 1 : cur);
      else if (e.key === "ArrowUp") move(row > 0 ? cur - cols : cur);
      else if (e.key === "ArrowDown") move(cur + cols < len ? cur + cols : cur);
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isGamesRef.current) launch((list[cur] as ArcadeGame).rel);
        else selectSystem((list[cur] as ArcadeSystem).name);
      } else if (e.key === "Escape" && isGamesRef.current) {
        e.preventDefault();
        setFocused(0);
        setSelectedSystem(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [launch, selectSystem]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (isGamesLevel) {
      // Con virtualización el foco puede quedar fuera de la ventana montada:
      // calculamos el scroll por fila en vez de depender del DOM.
      const row = Math.floor(focused / columns);
      const top = row * rowH;
      const bottom = top + rowH;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    } else {
      const tile = gridRef.current?.children[focused] as HTMLElement | undefined;
      tile?.scrollIntoView({ block: "nearest" });
    }
  }, [focused, isGamesLevel, columns, rowH]);

  const playing = state.arcade?.playing ?? false;
  const currentGame = state.arcade?.game as ArcadeGame | null | undefined;
  const error = state.arcade?.error;

  if (embedded) {
    return <EmbeddedPlayer data={data!} onStop={() => api.command(CHANNEL, "stop").then(load)} />;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(1200px 600px at 50% -10%, color-mix(in srgb, var(--ch-arcade) 28%, var(--bg)) 0%, var(--bg) 60%)",
        color: "var(--text)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Aviso de descarga del core: la primera partida de cada sistema
          necesita bajar la librería y hasta ahora no se veía nada. */}
      {notice && (
        <div
          style={{
            margin: "0 32px 8px",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid color-mix(in srgb, var(--ch-arcade) 45%, transparent)",
            background: "color-mix(in srgb, var(--ch-arcade) 18%, transparent)",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          {notice}
        </div>
      )}
      {/* Header */}
      <div
        style={{
          padding: "20px 32px 12px",
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            letterSpacing: 4,
            color: "var(--ch-arcade)",
            textShadow: "0 0 18px color-mix(in srgb, var(--ch-arcade) 60%, transparent)",
          }}
        >
          {isGamesLevel ? `🕹 ${activeSystem!.name.toUpperCase()}` : "🕹 ARCADE"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.45, fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
          {isGamesLevel ? "FLECHAS / ENTER PARA JUGAR · ESC VOLVER" : "FLECHAS / ENTER PARA ELEGIR CONSOLA"}
        </div>
      </div>

      {error && (
        <div
          style={{
            margin: "0 32px 12px",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "color-mix(in srgb, var(--danger) 18%, transparent)",
            border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)",
            fontSize: 13,
            color: "var(--danger)",
            flexShrink: 0,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Grilla */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "8px 32px 40px" }}>
        {data && systems.length === 0 && (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: 0.55,
            }}
          >
            <div style={{ fontSize: 40 }}>🕹</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, letterSpacing: 2 }}>
              NO HAY JUEGOS EN ~/Arcade
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Creá carpetas {`~/Arcade/<Sistema>/<Juego>/`} con una ROM y boxart.png
            </div>
          </div>
        )}
        {isGamesLevel ? (
          <div ref={gridRef} style={{ position: "relative", height: totalRows * rowH, width: "100%" }}>
            {gamesWindow.map((game, i) => {
              const idx = startIdx + i;
              const row = Math.floor(idx / columns);
              const col = idx % columns;
              return (
                <div
                  key={game.rel}
                  style={{
                    position: "absolute",
                    top: row * rowH,
                    left: col * (cardWidth + GAP),
                    width: cardWidth,
                  }}
                >
                  <Cartridge
                    game={game}
                    index={idx}
                    focused={idx === focused}
                    onFocus={focusCard}
                    onLaunch={launch}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            ref={gridRef}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(2, columns)}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {systems.map((system, idx) => (
              <ConsoleTile
                key={system.name}
                system={system}
                index={idx}
                focused={idx === focused}
                onFocus={focusCard}
                onPick={selectSystem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Indicador de juego en ejecución */}
      {playing && currentGame && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 32px",
            background: "color-mix(in srgb, var(--bg) 85%, transparent)",
            borderTop: "1px solid color-mix(in srgb, var(--ch-arcade) 35%, transparent)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            letterSpacing: 1,
            color: "var(--ch-arcade)",
          }}
        >
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent-soft)", boxShadow: "0 0 10px var(--accent-soft)" }} />
          JUGANDO: {(currentGame as ArcadeGame).name?.toUpperCase?.() ?? currentGame?.name ?? ""}
        </div>
      )}
    </div>
  );
}

const ConsoleTile = memo(function ConsoleTile({
  system,
  index,
  focused,
  onFocus,
  onPick,
}: {
  system: ArcadeSystem;
  index: number;
  focused: boolean;
  onFocus: (index: number) => void;
  onPick: (name: string) => void;
}) {
  const rep = system.games.find((g) => g.boxart) ?? null;
  return (
    <button
      onClick={() => onPick(system.name)}
      onMouseEnter={() => onFocus(index)}
      onFocus={() => onFocus(index)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: 18,
        borderRadius: "var(--radius-lg)",
        background: focused ? "color-mix(in srgb, var(--ch-arcade) 12%, transparent)" : "rgba(255,255,255,0.04)",
        border: focused ? "2px solid var(--ch-arcade)" : "1px solid rgba(255,255,255,0.1)",
        boxShadow: focused ? "0 0 26px color-mix(in srgb, var(--ch-arcade) 35%, transparent)" : "none",
        cursor: "pointer",
        color: "var(--text)",
        outline: "none",
        transition: "background 0.15s ease, border 0.15s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "3 / 2",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          background: "rgba(255,255,255,0.05)",
          display: "grid",
          placeItems: "center",
        }}
      >
        {rep ? (
          <img
            src={boxartUrl(rep.rel)}
            alt={system.name}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span style={{ fontSize: 40, opacity: 0.5 }}>🕹</span>
        )}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{system.name}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>
        {system.games.length} JUEGOS
      </div>
    </button>
  );
});

const Cartridge = memo(function Cartridge({
  game,
  index,
  focused,
  onFocus,
  onLaunch,
}: {
  game: ArcadeGame;
  index: number;
  focused: boolean;
  onFocus: (index: number) => void;
  onLaunch: (rel: string) => void;
}) {
  const type = cartTypeFor(game.system);
  // Ratio uniforme por sistema (real de las carátulas): mantiene las filas de
  // alto constante (necesario para virtualizar) y los placeholders alineados.
  const ar = type.ratio;
  const monogram = (game.name.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  const systemLabel = game.system.trim().toUpperCase().slice(0, 18);
  return (
    <button
      onClick={() => onLaunch(game.rel)}
      onMouseEnter={() => onFocus(index)}
      onFocus={() => onFocus(index)}
      className={`cartridge cart-${type.kind}${focused ? " is-focused" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
        boxSizing: "border-box",
        padding: 0,
        background: "transparent",
        border: "none",
        color: "var(--text)",
        cursor: "pointer",
        outline: "none",
      }}
    >
      <div className="cart-face" style={{ aspectRatio: String(ar) }}>
        {game.boxart ? (
          <img
            src={boxartUrl(game.rel)}
            alt={game.name}
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="cart-placeholder">
            <span className="cart-ph-mono">{monogram}</span>
            <span className="cart-ph-system">{systemLabel}</span>
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          textAlign: "center",
          opacity: focused ? 1 : 0.75,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {game.name}
      </div>
    </button>
  );
});

const PAD_BUTTONS: Record<number, string> = {
  // Mapeo por posición (igual que RetroArch): el botón físico de abajo (A en
  // Xbox) es el B del RetroPad, el de la derecha (B) es A, y X/Y se cruzan.
  0: "b",
  1: "a",
  2: "y",
  3: "x",
  4: "l",
  5: "r",
  6: "l2",
  7: "r2",
  8: "select",
  9: "start",
  10: "l3",
  11: "r3",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

const AXIS_DEADZONE = 0.45;

/** Botones del mando presentes en este frame. */
function padButtons(pad: Gamepad): Set<string> {
  const active = new Set<string>();
  pad.buttons.forEach((button, index) => {
    const name = PAD_BUTTONS[index];
    if (name && button.pressed) active.add(name);
  });
  const [x, y] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
  if (x < -AXIS_DEADZONE) active.add("left");
  if (x > AXIS_DEADZONE) active.add("right");
  if (y < -AXIS_DEADZONE) active.add("up");
  if (y > AXIS_DEADZONE) active.add("down");
  // Hat del D-pad en mandos viejos.
  const hatX = pad.axes[6] ?? 0;
  const hatY = pad.axes[7] ?? 0;
  if (hatX < -0.5) active.add("left");
  if (hatX > 0.5) active.add("right");
  if (hatY < -0.5) active.add("up");
  if (hatY > 0.5) active.add("down");
  return active;
}

const KEYMAP: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  z: "b",
  Z: "b",
  x: "a",
  X: "a",
  a: "x",
  A: "x",
  s: "y",
  S: "y",
  Enter: "start",
  Shift: "select",
};

const HUD_TIMEOUT_MS = 4000;

/** Player embebido: stream fMP4 del core + input + controles de sesión. */
function EmbeddedPlayer({ data, onStop }: { data: ArcadeData; onStop: () => void }) {
  const game = data.current as ArcadeGame | null;
  const held = useRef<Set<string>>(new Set());
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimer = useRef<number | null>(null);
  const [monitorFrame, setMonitorFrame] = useState(true);
  const [curvature, setCurvature] = useState(0.07);
  const [blackBorder, setBlackBorder] = useState(6);
  const [rounded, setRounded] = useState(false);
  const [monitorMode, setMonitorMode] = useState<"css" | "image">("css");
  const [monitorImage, setMonitorImage] = useState("/arcade/vintage-crt.webp");
  const [screenBox, setScreenBox] = useState({
    left: 14,
    top: 8.7,
    width: 68.25,
    height: 82.4,
  });
  const [tuning, setTuning] = useState(false);
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  // El HUD (datos del core/fps y botones) se oculta solo a los pocos segundos
  // para no tapar el juego; vuelve al mover el mouse o tocar la pantalla.
  const revealHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHudVisible(false), HUD_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    revealHud();
    return () => {
      if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    };
  }, [revealHud]);
  const [video, setVideo] = useState<{ height: number; shader: ArcadeShader }>({
    height: 720,
    shader: "crt",
  });
  const [padName, setPadName] = useState<string | null>(null);
  const wsBase = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const framesUrl = useMemo(
    () => `${wsBase}/api/channels/${CHANNEL}/frames`,
    [wsBase],
  );
  const audioFramesUrl = useMemo(
    () => `${wsBase}/api/channels/${CHANNEL}/audio-frames`,
    [wsBase],
  );

  // Mientras el player está abierto el mando pertenece al juego: se suspende
  // la navegación global (A/B/flechas) para no disparar la UI encima. La barra
  // de canales también se oculta: pisaría los controles del player.
  useEffect(() => {
    setGamepadNavSuspended(true);
    document.body.classList.add("arcade-player-open");
    return () => {
      setGamepadNavSuspended(false);
      document.body.classList.remove("arcade-player-open");
    };
  }, []);

  // Preferencias de video del arcade (salida, shader y marco de monitor).
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          cfg: {
            arcade_output_height?: number;
            arcade_shader?: string;
            arcade_monitor_frame?: boolean;
            arcade_monitor_curvature?: number;
            arcade_monitor_black_border?: number;
            arcade_monitor_rounded?: boolean;
            arcade_monitor_mode?: string;
            arcade_monitor_image?: string;
            arcade_monitor_screen_left?: number;
            arcade_monitor_screen_top?: number;
            arcade_monitor_screen_width?: number;
            arcade_monitor_screen_height?: number;
          } | null,
        ) => {
          if (!cfg) return;
          setVideo({
            height: Number(cfg.arcade_output_height) || 720,
            shader: (cfg.arcade_shader as ArcadeShader) || "crt",
          });
          setMonitorFrame(cfg.arcade_monitor_frame !== false);
          if (typeof cfg.arcade_monitor_curvature === "number") {
            setCurvature(cfg.arcade_monitor_curvature);
          }
          if (typeof cfg.arcade_monitor_black_border === "number") {
            setBlackBorder(cfg.arcade_monitor_black_border);
          }
          setRounded(cfg.arcade_monitor_rounded === true);
          setMonitorMode(cfg.arcade_monitor_mode === "image" ? "image" : "css");
          if (typeof cfg.arcade_monitor_image === "string" && cfg.arcade_monitor_image) {
            setMonitorImage(cfg.arcade_monitor_image);
          }
          setScreenBox({
            left: Number(cfg.arcade_monitor_screen_left) || 14,
            top: Number(cfg.arcade_monitor_screen_top) || 8.7,
            width: Number(cfg.arcade_monitor_screen_width) || 68.25,
            height: Number(cfg.arcade_monitor_screen_height) || 82.4,
          });
        },
      )
      .catch(() => {});
  }, []);

  // Cambiar el marco o sus parámetros desde Ajustes se aplica en caliente.
  useEffect(() => {
    const onChange = (raw: Event) => {
      const detail = (raw as CustomEvent<{ key?: string; value?: unknown }>).detail;
      if (detail?.key === "arcade_monitor_frame") {
        setMonitorFrame(detail.value !== false);
      } else if (detail?.key === "arcade_monitor_curvature") {
        const value = Number(detail.value);
        if (Number.isFinite(value)) setCurvature(value);
      } else if (detail?.key === "arcade_monitor_black_border") {
        const value = Number(detail.value);
        if (Number.isFinite(value)) setBlackBorder(value);
      } else if (detail?.key === "arcade_monitor_rounded") {
        setRounded(detail.value === true);
      } else if (detail?.key === "arcade_monitor_mode") {
        setMonitorMode(detail.value === "image" ? "image" : "css");
      } else if (detail?.key === "arcade_monitor_image") {
        if (typeof detail.value === "string" && detail.value) {
          setMonitorImage(detail.value);
        }
      } else if (detail?.key === "arcade_monitor_screen_left") {
        const value = Number(detail.value);
        if (Number.isFinite(value)) setScreenBox((box) => ({ ...box, left: value }));
      } else if (detail?.key === "arcade_monitor_screen_top") {
        const value = Number(detail.value);
        if (Number.isFinite(value)) setScreenBox((box) => ({ ...box, top: value }));
      } else if (detail?.key === "arcade_monitor_screen_width") {
        const value = Number(detail.value);
        if (Number.isFinite(value)) setScreenBox((box) => ({ ...box, width: value }));
      } else if (detail?.key === "arcade_monitor_screen_height") {
        const value = Number(detail.value);
        if (Number.isFinite(value)) setScreenBox((box) => ({ ...box, height: value }));
      }
    };
    window.addEventListener("catodo:config_changed", onChange as EventListener);
    return () =>
      window.removeEventListener("catodo:config_changed", onChange as EventListener);
  }, []);

  useEffect(() => {
    const send = (command: "press" | "release", button: string) =>
      api.command(CHANNEL, command, { button }).catch(() => {});

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        setTuning((value) => !value);
        return;
      }
      if (tuningRef.current) {
        if (event.key === "Escape") setTuning(false);
        return;
      }
      if (event.key === "Escape") {
        send("release", "start");
        onStop();
        return;
      }
      const button = KEYMAP[event.key];
      if (!button) return;
      event.preventDefault();
      if (held.current.has(button)) return;
      held.current.add(button);
      send("press", button);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (tuningRef.current) return;
      const button = KEYMAP[event.key];
      if (!button) return;
      event.preventDefault();
      held.current.delete(button);
      send("release", button);
    };
    // Al perder foco se sueltan los botones para no quedar "pegados".
    const onBlur = () => {
      held.current.forEach((button) => send("release", button));
      held.current.clear();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onStop]);

  // Gamepad: se sondea con rAF y se mandan press/release sólo en los cambios.
  useEffect(() => {
    const send = (command: "press" | "release", button: string) =>
      api.command(CHANNEL, command, { button }).catch(() => {});
    const pressed = new Set<string>();
    let frame = 0;

    const poll = () => {
      if (tuningRef.current) {
        pressed.forEach((button) => send("release", button));
        pressed.clear();
        frame = requestAnimationFrame(poll);
        return;
      }
      const connected = navigator.getGamepads?.() ?? [];
      const pad = Array.from(connected).find((candidate) => candidate && candidate.connected) ?? null;
      const next = pad ? padButtons(pad) : new Set<string>();
      for (const button of next) {
        if (!pressed.has(button)) {
          pressed.add(button);
          send("press", button);
        }
      }
      for (const button of [...pressed]) {
        if (!next.has(button)) {
          pressed.delete(button);
          send("release", button);
        }
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    const updateCount = () => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(
        (candidate) => candidate && candidate.connected,
      );
      setPadName(pad ? pad.id.replace(/\(.*\)$/, "").trim() : null);
    };
    updateCount();
    window.addEventListener("gamepadconnected", updateCount);
    window.addEventListener("gamepaddisconnected", updateCount);

    return () => {
      cancelAnimationFrame(frame);
      pressed.forEach((button) => send("release", button));
      window.removeEventListener("gamepadconnected", updateCount);
      window.removeEventListener("gamepaddisconnected", updateCount);
    };
  }, []);

  const [width, height] = data.resolution ?? [0, 0];
  const videoAspect =
    data.aspect && data.aspect > 0
      ? data.aspect
      : width > 0 && height > 0
        ? width / height
        : 4 / 3;
  const usingImage =
    monitorFrame && monitorMode === "image" && monitorImage.length > 0;
  const imageBoxStyle = usingImage
    ? {
        left: `${screenBox.left}%`,
        top: `${screenBox.top}%`,
        width: `${screenBox.width}%`,
        height: `${screenBox.height}%`,
      }
    : undefined;

  return (
    <div
      onMouseMove={revealHud}
      onMouseDown={revealHud}
      onTouchStart={revealHud}
      style={{
        position: "absolute",
        inset: 0,
        background: "#000",
        color: "var(--text)",
        cursor: hudVisible ? "default" : "none",
      }}
    >
      <ArcadeAudio src={audioFramesUrl} />
      <div
        className={`arcade-stage${monitorFrame ? " is-monitor" : ""}${usingImage ? " is-image" : ""}`}
      >
        <div
          className={`arcade-monitor-shell${monitorFrame && !usingImage ? " is-tv" : ""}${usingImage ? " is-image-screen" : ""}`}
          style={imageBoxStyle}
        >
          {monitorFrame && !usingImage && (
            <div className="crt-tv-brand" aria-hidden>
              <span className="crt-tv-logo">CÁTODO</span>
              <span className="crt-tv-logo-bars">
                <i />
                <i />
                <i />
              </span>
              <span className="crt-tv-reg">®</span>
            </div>
          )}

          <div className="crt-screen-shell">
            <div
              className="arcade-monitor-screen"
              style={
                {
                  "--monitor-black-border": `${blackBorder}px`,
                  "--monitor-radius": rounded ? "4% / 5.2%" : "0px",
                } as CSSProperties
              }
            >
              <ArcadeCanvas
                framesUrl={framesUrl}
                fallbackSrc={`/api/channels/${CHANNEL}/stream`}
                shader={video.shader}
                outputHeight={video.height}
                aspectRatio={data.aspect}
                fill={monitorFrame && Math.abs(videoAspect - 4 / 3) < 0.04}
                curvature={monitorFrame ? curvature : 0.025}
              />

              {/* HUD superior: datos del core/fps dentro de la pantalla. */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "10px 20px 26px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: 2,
                  color: "var(--text-dim)",
                  background: "linear-gradient(180deg, rgba(0,0,0,0.78), transparent)",
                  opacity: hudVisible ? 1 : 0,
                  pointerEvents: hudVisible ? "auto" : "none",
                  transition: "opacity 0.35s ease",
                }}
              >
                <span style={{ color: "var(--ch-arcade)" }}>{game?.name ?? "ARCADE"}</span>
                <span>{data.core ?? ""}</span>
                <span>
                  {width > 0 ? `${width}×${height}` : ""}{" "}
                  {data.fps ? `${data.fps.toFixed(1)} fps` : ""}
                </span>
                <span style={{ marginLeft: "auto" }}>
                  {padName ? `🎮 ${padName.slice(0, 28)}` : "sin gamepad"} ·{" "}
                  {video.shader.toUpperCase()} · {video.height}p · F1 AJUSTES · ESC SALIR
                </span>
              </div>

              {/* Controles de sesión, también auto-ocultables. */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: 2,
                  display: "flex",
                  gap: 8,
                  padding: "26px 20px 10px",
                  background: "linear-gradient(0deg, rgba(0,0,0,0.78), transparent)",
                  opacity: hudVisible ? 1 : 0,
                  pointerEvents: hudVisible ? "auto" : "none",
                  transition: "opacity 0.35s ease",
                }}
              >
                <PlayerButton label="VOLVER" onClick={onStop} />
                <PlayerButton label="TV · F1" onClick={() => setTuning((value) => !value)} />
                <PlayerButton
                  label="RESET"
                  onClick={() => api.command(CHANNEL, "reset").catch(() => {})}
                />
                <PlayerButton
                  label="GUARDAR"
                  onClick={() => api.command(CHANNEL, "save_state", { slot: 1 }).catch(() => {})}
                />
                <PlayerButton
                  label="CARGAR"
                  onClick={() => api.command(CHANNEL, "load_state", { slot: 1 }).catch(() => {})}
                />
              </div>
            </div>
          </div>

          {monitorFrame && !usingImage && (
            <aside className="crt-tv-panel">
              <div className="crt-tv-model">
                COLOR
                <br />
                TV MONITOR
                <br />
                <b>14&quot;</b>
              </div>
              <div className="crt-tv-grille" />
              <button
                type="button"
                className="crt-tv-power"
                title="Apagar / volver al launcher"
                onClick={onStop}
              >
                <span className="crt-tv-power-label">POWER</span>
                <span className="crt-tv-power-led" />
              </button>
              <div className="crt-tv-knob-wrap">
                <span className="crt-tv-knob-label">BRIGHT</span>
                <span className="crt-tv-knob" />
              </div>
              <div className="crt-tv-knob-wrap">
                <span className="crt-tv-knob-label">CONTRAST</span>
                <span className="crt-tv-knob" />
              </div>
            </aside>
          )}
        </div>

        {usingImage && (
          <img className="arcade-image-frame" src={monitorImage} alt="" aria-hidden />
        )}
      </div>

      {tuning && (
        <div
          role="dialog"
          aria-label="Ajustes del monitor"
          style={{
            position: "absolute",
            right: "clamp(16px, 2vw, 34px)",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            width: "min(360px, 88vw)",
            maxHeight: "80vh",
            overflowY: "auto",
            padding: "12px 14px",
            background: "color-mix(in srgb, var(--surface) 94%, transparent)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
            color: "var(--text)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: 2,
                color: "var(--text-dim)",
              }}
            >
              AJUSTES DE MONITOR
            </span>
            <button
              type="button"
              aria-label="Cerrar ajustes del monitor"
              onClick={() => setTuning(false)}
              style={{
                width: 26,
                height: 26,
                display: "grid",
                placeItems: "center",
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
          <MonitorControls
            onChange={(params) => {
              setMonitorFrame(params.enabled);
              setCurvature(params.curvature);
              setBlackBorder(params.blackBorder);
              setRounded(params.rounded);
              setMonitorMode(params.mode);
              setMonitorImage(params.imageUrl);
              setScreenBox({
                left: params.screenLeft,
                top: params.screenTop,
                width: params.screenWidth,
                height: params.screenHeight,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function PlayerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-dim)",
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: 1.5,
      }}
    >
      {label}
    </button>
  );
}
