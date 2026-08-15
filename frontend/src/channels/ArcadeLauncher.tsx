import { useEffect, useMemo, useRef, useState } from "react";
import { api, type AppState } from "../api/client";

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
}

interface CartType {
  kind: "cart" | "jewel" | "marquee";
  ratio: number;
}

const CHANNEL = "arcade";
const CARD_W = 240;

// Forma/proporción de cartucho por sistema (ratio = ancho/alto, fallback sin boxart).
const CARTRIDGE_TYPES: Record<string, CartType> = {
  snes: { kind: "cart", ratio: 0.72 },
  "super nintendo": { kind: "cart", ratio: 0.72 },
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
  psx: { kind: "jewel", ratio: 0.9 },
  ps1: { kind: "jewel", ratio: 0.9 },
  playstation: { kind: "jewel", ratio: 0.9 },
  psp: { kind: "jewel", ratio: 0.9 },
  segacd: { kind: "jewel", ratio: 0.9 },
  saturn: { kind: "jewel", ratio: 0.9 },
  dreamcast: { kind: "jewel", ratio: 0.9 },
  mame: { kind: "marquee", ratio: 1.55 },
  arcade: { kind: "marquee", ratio: 1.55 },
};
const DEFAULT_CART: CartType = { kind: "cart", ratio: 0.75 };
const cartTypeFor = (system: string) =>
  CARTRIDGE_TYPES[system.trim().toLowerCase()] ?? DEFAULT_CART;

const boxartUrl = (rel: string) => `/api/channels/${CHANNEL}/boxart?path=${encodeURIComponent(rel)}`;

export default function ArcadeLauncher({ state }: { state: AppState }) {
  const [data, setData] = useState<ArcadeData | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/channels/${CHANNEL}/state`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ArcadeData | null) => {
          if (alive && d) setData(d);
        })
        .catch(() => {});
    load();
    return () => {
      alive = false;
    };
  }, [state.arcade?.boxart_revision]);

  const systems = useMemo(() => data?.systems ?? [], [data]);
  const activeSystem = useMemo(
    () => systems.find((s) => s.name === selectedSystem) ?? null,
    [systems, selectedSystem],
  );
  const items: ArcadeSystem[] | ArcadeGame[] = activeSystem ? activeSystem.games : systems;
  const isGamesLevel = !!activeSystem;
  const columns = Math.max(1, Math.floor((window.innerWidth || 1920) / CARD_W));

  const launch = (rel: string) => {
    api.command(CHANNEL, "launch", { game: rel }).catch(() => {});
  };

  const selectSystem = (name: string) => {
    setFocused(0);
    setSelectedSystem(name);
  };

  // Navegación con teclado/remote según nivel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      const cur = focused;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocused((cur + 1) % items.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocused((cur - 1 + items.length) % items.length);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocused((cur + columns) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocused((cur - columns + items.length) % items.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isGamesLevel) {
          launch((items[cur] as ArcadeGame).rel);
        } else {
          selectSystem((items[cur] as ArcadeSystem).name);
        }
      } else if (e.key === "Escape" && isGamesLevel) {
        e.preventDefault();
        setFocused(0);
        setSelectedSystem(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [items, focused, columns, isGamesLevel]);

  useEffect(() => {
    const el = listRef.current?.children[focused] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  const playing = state.arcade?.playing ?? false;
  const currentGame = state.arcade?.game as ArcadeGame | null | undefined;
  const error = state.arcade?.error;

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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: 18,
            }}
          >
            {activeSystem!.games.map((game, idx) => (
              <Cartridge
                key={game.rel}
                game={game}
                focused={idx === focused}
                onFocus={() => setFocused(idx)}
                onLaunch={() => launch(game.rel)}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(2, columns)}, minmax(0, 1fr))`,
              gap: 18,
            }}
          >
            {systems.map((system, idx) => (
              <ConsoleTile
                key={system.name}
                system={system}
                focused={idx === focused}
                onFocus={() => setFocused(idx)}
                onPick={() => selectSystem(system.name)}
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

function ConsoleTile({
  system,
  focused,
  onFocus,
  onPick,
}: {
  system: ArcadeSystem;
  focused: boolean;
  onFocus: () => void;
  onPick: () => void;
}) {
  const rep = system.games.find((g) => g.boxart) ?? null;
  return (
    <button
      onClick={onPick}
      onMouseEnter={onFocus}
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
}

function Cartridge({
  game,
  focused,
  onFocus,
  onLaunch,
}: {
  game: ArcadeGame;
  focused: boolean;
  onFocus: () => void;
  onLaunch: () => void;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const type = cartTypeFor(game.system);
  const ar = ratio ?? type.ratio;
  return (
    <button
      onClick={onLaunch}
      onMouseEnter={onFocus}
      className={`cartridge cart-${type.kind}${focused ? " is-focused" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
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
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setRatio(img.naturalWidth / img.naturalHeight);
              }
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="cart-placeholder">🕹</span>
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
}
