import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";

const CHANNEL = "iptv";
const STREAM_URL = `/api/channels/${CHANNEL}/stream`;
const REFRESH_MS = 15000;

async function channelCommand(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/channels/${CHANNEL}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return;
  let detail = `HTTP ${response.status}`;
  try {
    const parsed = (await response.json()) as { detail?: string };
    if (parsed?.detail) detail = parsed.detail;
  } catch {
    // Sin body JSON: conservar el status.
  }
  throw new Error(detail);
}

interface IptvEntry {
  id: string;
  name: string;
  logo: string;
  group: string;
  available?: boolean;
  error?: string | null;
}

interface IptvGroup {
  name: string;
  channels: IptvEntry[];
}

interface IptvHealth {
  checking: boolean;
  checked: number;
  total: number;
  available: number;
  unavailable: number;
  checked_at?: number | null;
}

interface IptvState {
  configured: boolean;
  groups: IptvGroup[];
  current: IptvEntry | null;
  count: number;
  error?: string | null;
  health?: IptvHealth;
}

/**
 * Canal IPTV: lista por grupos + zapping.
 *
 * El stream sale de `/api/channels/iptv/stream`, que el backend sirve desde el
 * stdout de ffmpeg. Al cambiar de canal el backend mata el proceso anterior.
 */
export default function IptvChannel() {
  const [data, setData] = useState<IptvState | null>(null);
  const [groupIdx, setGroupIdx] = useState(0);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stallTimer = useRef<number | null>(null);
  const groupIdxRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/channels/${CHANNEL}/state`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as IptvState;
      setData(next);
    } catch {
      setCmdError("no se pudo leer la lista");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Mientras el backend verifica canales, refrescamos más seguido para ver el
  // progreso y ocultar los caídos apenas termina.
  useEffect(() => {
    if (!data?.health?.checking) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [data?.health?.checking, load]);

  // La verificación corre en background en el backend; al terminar refresca
  // la lista para ocultar los canales caídos sin esperar al poll de 15 s.
  useEffect(() => {
    const onHealth = () => load();
    window.addEventListener("catodo:iptv_health_changed", onHealth);
    return () => window.removeEventListener("catodo:iptv_health_changed", onHealth);
  }, [load]);

  useEffect(() => {
    groupIdxRef.current = groupIdx;
  }, [groupIdx]);

  // Al cambiar de canal el backend tarda en abrir el HLS y arrancar ffmpeg.
  const currentId = data?.current?.id ?? null;
  useEffect(() => {
    setAudioOnly(false);
    setStalled(false);
    setCmdError(null);
    if (currentId) setBuffering(true);
  }, [currentId, reloadKey]);

  // Si en 12 s no llegó ningún frame, el canal está caído o colgado. Se
  // cancela apenas el video reproduce: si no, el aviso aparecía sobre un canal
  // que estaba andando.
  const clearStall = useCallback(() => {
    if (stallTimer.current !== null) {
      clearTimeout(stallTimer.current);
      stallTimer.current = null;
    }
    setStalled(false);
  }, []);

  useEffect(() => {
    if (!currentId) return;
    if (stallTimer.current !== null) clearTimeout(stallTimer.current);
    stallTimer.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.currentTime > 0) return;
      setStalled(true);
    }, 12000);
    return () => {
      if (stallTimer.current !== null) {
        clearTimeout(stallTimer.current);
        stallTimer.current = null;
      }
    };
  }, [currentId, reloadKey]);

  const allGroups = data?.groups ?? [];
  const groups = useMemo(() => {
    if (showUnavailable) return allGroups;
    return allGroups
      .map((item) => ({
        ...item,
        channels: item.channels.filter((entry) => entry.available !== false),
      }))
      .filter((item) => item.channels.length > 0);
  }, [allGroups, showUnavailable]);
  const group = groups[Math.min(groupIdx, Math.max(groups.length - 1, 0))];
  const current = data?.current ?? null;
  const health = data?.health;

  useEffect(() => {
    if (groups.length > 0 && groupIdx >= groups.length) {
      setGroupIdx(groups.length - 1);
    }
  }, [groups.length, groupIdx]);

  const select = useCallback(
    async (entry: IptvEntry) => {
      if (entry.available === false) return;
      if (entry.id === current?.id) return;
      setCmdError(null);
      setStalled(false);
      setBuffering(true);
      try {
        await channelCommand({ command: "set_channel", channel: entry.id });
        await load();
      } catch (cause) {
        setBuffering(false);
        await load();
        setCmdError(cause instanceof Error ? cause.message : "no se pudo abrir el canal");
      }
    },
    [current?.id, load],
  );

  const zap = useCallback(
    async (direction: "next" | "prev") => {
      setCmdError(null);
      try {
        await channelCommand({ command: direction });
        await load();
      } catch (cause) {
        await load();
        setCmdError(cause instanceof Error ? cause.message : "no se pudo cambiar de canal");
      }
    },
    [load],
  );

  const verify = useCallback(async () => {
    setCmdError(null);
    try {
      await channelCommand({ command: "check" });
      await load();
    } catch (cause) {
      setCmdError(cause instanceof Error ? cause.message : "no se pudo verificar la lista");
    }
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const total = groups.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (total === 0) return;
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setGroupIdx((index) => (index + delta + total) % total);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        zap("next");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        zap("prev");
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setExpanded((value) => !value);
      } else if (event.key === "Enter" && !current) {
        const first = groups[groupIdxRef.current]?.channels.find(
          (entry) => entry.available !== false,
        );
        if (first) {
          event.preventDefault();
          select(first);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groups, current, select, zap]);

  return (
    <div style={containerStyle}>
      <div style={{ ...headerStyle, flexWrap: "wrap" }}>
        <span style={labelStyle}>IPTV</span>
        <span style={dimStyle}>
          {data
            ? `${health?.available ?? data.count} de ${data.count} canales`
            : "cargando…"}
          {health?.checking
            ? ` · verificando ${health.checked}/${health.total}`
            : health && health.unavailable > 0
              ? ` · ${health.unavailable} caídos`
              : ""}
          {current ? ` · ${current.name}` : ""}
        </span>
        <div style={headerActionsStyle}>
          <button
            type="button"
            onClick={verify}
            disabled={health?.checking}
            style={{ ...headerButtonStyle, opacity: health?.checking ? 0.55 : 1 }}
            title="Verificar qué canales responden"
          >
            {health?.checking ? "VERIFICANDO…" : "VERIFICAR"}
          </button>
          {(health?.unavailable ?? 0) > 0 || showUnavailable ? (
            <button
              type="button"
              onClick={() => setShowUnavailable((value) => !value)}
              style={headerButtonStyle}
              title="Mostrar u ocultar los canales que no respondieron"
            >
              {showUnavailable ? "OCULTAR CAÍDOS" : `CAÍDOS (${health?.unavailable ?? 0})`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            style={headerButtonStyle}
            title={expanded ? "Volver a la lista (F)" : "Ampliar el canal (F)"}
          >
            {expanded ? "REDUCIR" : "AMPLIAR"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flex: 1, minHeight: 0 }}>
        {!expanded && (
        <div style={groupsStyle}>
          {groups.map((item, index) => {
            const active = index === groupIdx;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setGroupIdx(index)}
                style={{
                  ...groupButtonStyle,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  borderColor: active ? "var(--accent)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {item.name}
                <span style={countStyle}>
                  {showUnavailable
                    ? `${item.channels.filter((entry) => entry.available !== false).length}/${item.channels.length}`
                    : item.channels.length}
                </span>
              </button>
            );
          })}
          {groups.length === 0 && (
            <div style={dimStyle}>
              {data?.configured
                ? data.count > 0
                  ? "No hay canales disponibles. Verificá de nuevo o mostrá los caídos."
                  : "La playlist no tiene canales."
                : "Configurá `iptv_playlist` con un .m3u local o una URL."}
            </div>
          )}
        </div>
        )}

        {!expanded && (
        <div style={listStyle}>
          {group?.channels.map((entry) => {
            const active = current?.id === entry.id;
            const unavailable = entry.available === false;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => select(entry)}
                disabled={unavailable}
                title={unavailable ? entry.error ?? "canal no disponible" : entry.name}
                style={{
                  ...channelButtonStyle,
                  borderColor: unavailable
                    ? "color-mix(in srgb, var(--danger) 40%, transparent)"
                    : active
                      ? "var(--accent)"
                      : "var(--border)",
                  background: active
                    ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                    : "color-mix(in srgb, var(--text) 6%, transparent)",
                  opacity: unavailable ? 0.45 : 1,
                  cursor: unavailable ? "not-allowed" : "pointer",
                }}
              >
                {entry.logo ? (
                  <img
                    src={entry.logo}
                    alt=""
                    style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 4 }}
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span style={{ width: 32, textAlign: "center", opacity: 0.4 }}>▣</span>
                )}
                <span style={{ textAlign: "left", flex: 1 }}>{entry.name}</span>
                {unavailable && <span style={unavailableBadgeStyle}>CAÍDO</span>}
              </button>
            );
          })}
        </div>
        )}

        <div style={playerStyle} onDoubleClick={() => setExpanded((value) => !value)}>
          {current ? (
            <video
              ref={videoRef}
              key={`${current.id}-${reloadKey}`}
              src={`${STREAM_URL}?channel=${encodeURIComponent(current.id)}&v=${reloadKey}`}
              autoPlay
              playsInline
              controls={false}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              onLoadedMetadata={(event) => {
                setCmdError(null);
                // Radios y streams sin pista de video: negro no es un error.
                if (event.currentTarget.videoWidth === 0) setAudioOnly(true);
              }}
              onLoadedData={() => {
                setBuffering(false);
                setCmdError(null);
                clearStall();
              }}
              onPlaying={() => {
                setBuffering(false);
                setCmdError(null);
                clearStall();
              }}
              onWaiting={() => setBuffering(true)}
              onError={(event) => {
                // Al cambiar de canal, el <video> viejo se desmonta y su
                // stream abortado dispara un error tardío. Si ya estamos en
                // otro elemento, ese error no aplica al canal actual.
                if (event.currentTarget !== videoRef.current) return;
                setBuffering(false);
                setCmdError("señal no disponible");
              }}
            />
          ) : (
            <div style={placeholderStyle}>
              {expanded ? "F para volver a la lista" : "Elegí un canal para empezar"}
            </div>
          )}
          {audioOnly && !cmdError && !data?.error && (
            <div style={audioStyle}>
              <Icon name="music" size={56} strokeWidth={1.5} color="var(--accent)" />
              <div style={{ fontSize: 22, fontWeight: 600 }}>{current?.name}</div>
              <div style={dimStyle}>radio · sólo audio</div>
            </div>
          )}
          {buffering && !audioOnly && !stalled && !cmdError && !data?.error && (
            <div style={bufferingStyle}>conectando…</div>
          )}
          {stalled && !audioOnly && !cmdError && !data?.error && (
            <div style={stalledStyle}>
              <span>sin datos del stream</span>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                style={retryStyle}
              >
                Reintentar
              </button>
            </div>
          )}
          {(cmdError || data?.error) && (
            <div style={errorStyle}>
              <span>{friendlyError(cmdError || data?.error || "")}</span>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                style={retryStyle}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={hintStyle}>↑↓ GRUPO · ←→ CANAL · ENTER ELEGIR · F AMPLIAR</div>
    </div>
  );
}

/** Traduce el error técnico del backend a algo accionable. */
function friendlyError(error: string): string {
  if (error.includes("no se pudo lanzar ffmpeg")) {
    return "falta ffmpeg: brew install ffmpeg";
  }
  return error;
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: "28px 36px 36px",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "var(--font-display)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  letterSpacing: 3,
};

const headerActionsStyle: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};

const headerButtonStyle: React.CSSProperties = {
  padding: "5px 10px",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: 1.2,
};

const unavailableBadgeStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid color-mix(in srgb, var(--danger) 45%, transparent)",
  color: "var(--danger)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: 1,
};

const dimStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-dim)",
};

const groupsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 220,
  overflowY: "auto",
};

const groupButtonStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontSize: 14,
  textAlign: "left",
};

const countStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  opacity: 0.6,
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 280,
  overflowY: "auto",
};

const channelButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 14,
};

const playerStyle: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: 0,
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  border: "1px solid var(--border)",
  background: "#000",
};

const placeholderStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: "var(--text-dim)",
  fontSize: 14,
};

const audioStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  color: "var(--text)",
  background: "radial-gradient(circle at 50% 40%, rgba(29,185,84,0.12), transparent 60%)",
  pointerEvents: "none",
};

const stalledStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  color: "var(--text-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  letterSpacing: 1.5,
  background: "rgba(0,0,0,0.6)",
};

const retryStyle: React.CSSProperties = {
  pointerEvents: "auto",
  padding: "6px 14px",
  background: "transparent",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-sm)",
  color: "var(--accent)",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: 1,
};

const bufferingStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: "var(--text-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  letterSpacing: 2,
  background: "rgba(0,0,0,0.55)",
  pointerEvents: "none",
};

const errorStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  borderRadius: "var(--radius-sm)",
  background: "color-mix(in srgb, var(--danger) 25%, transparent)",
  border: "1px solid var(--danger)",
  color: "var(--text)",
  fontSize: 12,
};

const hintStyle: React.CSSProperties = {
  position: "relative",
  fontSize: 12,
  color: "var(--text-dim)",
  fontFamily: "var(--font-mono)",
  letterSpacing: 1.5,
};
