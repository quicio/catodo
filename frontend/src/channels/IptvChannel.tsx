import { useCallback, useEffect, useRef, useState } from "react";

const CHANNEL = "iptv";
const STREAM_URL = `/api/channels/${CHANNEL}/stream`;
const REFRESH_MS = 15000;

interface IptvEntry {
  id: string;
  name: string;
  logo: string;
  group: string;
}

interface IptvGroup {
  name: string;
  channels: IptvEntry[];
}

interface IptvState {
  configured: boolean;
  groups: IptvGroup[];
  current: IptvEntry | null;
  count: number;
  error?: string | null;
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

  useEffect(() => {
    groupIdxRef.current = groupIdx;
  }, [groupIdx]);

  // Al cambiar de canal el backend tarda en abrir el HLS y arrancar ffmpeg.
  const currentId = data?.current?.id ?? null;
  useEffect(() => {
    if (currentId) setBuffering(true);
  }, [currentId]);

  const groups = data?.groups ?? [];
  const group = groups[Math.min(groupIdx, Math.max(groups.length - 1, 0))];
  const current = data?.current ?? null;

  const select = useCallback(
    async (entry: IptvEntry) => {
      setCmdError(null);
      try {
        await fetch(`/api/channels/${CHANNEL}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "set_channel", channel: entry.id }),
        });
        await load();
      } catch {
        setCmdError("no se pudo cambiar de canal");
      }
    },
    [load],
  );

  const zap = useCallback(
    async (direction: "next" | "prev") => {
      setCmdError(null);
      try {
        await fetch(`/api/channels/${CHANNEL}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: direction }),
        });
        await load();
      } catch {
        setCmdError("no se pudo cambiar de canal");
      }
    },
    [load],
  );

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
      } else if (event.key === "Enter" && !current) {
        const first = groups[groupIdxRef.current]?.channels[0];
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
      <div style={headerStyle}>
        <span style={labelStyle}>IPTV</span>
        <span style={dimStyle}>
          {data ? `${data.count} canales` : "cargando…"}
          {current ? ` · ${current.name}` : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flex: 1, minHeight: 0 }}>
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
                <span style={countStyle}>{item.channels.length}</span>
              </button>
            );
          })}
          {groups.length === 0 && (
            <div style={dimStyle}>
              {data?.configured
                ? "La playlist no tiene canales."
                : "Configurá `iptv_playlist` con un .m3u local o una URL."}
            </div>
          )}
        </div>

        <div style={listStyle}>
          {group?.channels.map((entry) => {
            const active = current?.id === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => select(entry)}
                style={{
                  ...channelButtonStyle,
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: active
                    ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                    : "color-mix(in srgb, var(--text) 6%, transparent)",
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
              </button>
            );
          })}
        </div>

        <div style={playerStyle}>
          {current ? (
            <video
              key={current.id}
              src={STREAM_URL}
              autoPlay
              playsInline
              controls={false}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              onLoadedData={() => setBuffering(false)}
              onPlaying={() => setBuffering(false)}
              onWaiting={() => setBuffering(true)}
              onError={() => {
                setBuffering(false);
                setCmdError("señal no disponible");
              }}
            />
          ) : (
            <div style={placeholderStyle}>Elegí un canal para empezar</div>
          )}
          {buffering && !cmdError && !data?.error && (
            <div style={bufferingStyle}>conectando…</div>
          )}
          {(cmdError || data?.error) && (
            <div style={errorStyle}>{cmdError || data?.error}</div>
          )}
        </div>
      </div>

      <div style={hintStyle}>↑↓ GRUPO · ←→ CANAL · ENTER ELEGIR</div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: "28px 36px calc(var(--channel-bar-height) + 8px)",
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
