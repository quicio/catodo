import { useEffect, useRef, useState } from "react";
import { api, type AppState } from "../api/client";

interface NowPlaying {
  available?: boolean;
  status?: string;
  title?: string;
  artist?: string;
  album?: string;
  art_url?: string;
  position?: number;
}

interface HistoryItem {
  track_id: string;
  spotify_uri: string | null;
  title: string;
  artist: string;
  album: string;
  art_url: string;
  played_at: number;
}

interface LyricLine {
  t: number;
  text: string;
}

interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
  plain: string;
  track?: string;
  artist?: string;
}

export default function NowPlaying({ state }: { state: AppState }) {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsStatus, setLyricsStatus] = useState<"idle" | "loading" | "ok" | "missing">("idle");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const lastKeyRef = useRef<string>("");

  const np = state.spotify
    ? {
        available: true,
        status: state.spotify.status,
        title: state.spotify.title,
        artist: state.spotify.artist,
        album: state.spotify.album,
        art_url: state.spotify.art_url,
        position: state.spotify.position,
      }
    : null;

  // Fetch lyrics when track changes (driven by state.spotify, no polling)
  useEffect(() => {
    if (!np || !np.title || !np.artist) return;
    const key = `${np.artist}|${np.title}|${np.album ?? ""}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    setLyricsStatus("loading");
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ artist: np.artist!, track: np.title! });
        const lr = await fetch(`/api/lyrics?${params}`);
        if (lr.ok) {
          const ldata = (await lr.json()) as Lyrics;
          if (!cancelled) {
            setLyrics(ldata);
            setLyricsStatus("ok");
          }
        } else {
          if (!cancelled) setLyricsStatus("missing");
        }
      } catch {
        if (!cancelled) setLyricsStatus("missing");
      }
    })();
    return () => { cancelled = true; };
  }, [np?.title, np?.artist, np?.album]);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const r = await fetch("/api/channels/spotify/history");
        if (!r.ok || cancelled) return;
        const data = await r.json();
        setHistory(data.items ?? []);
      } catch {}
    };
    loadHistory();
    const id = setInterval(loadHistory, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const playHistory = (item: HistoryItem) => {
    if (item.spotify_uri) {
      api
        .command("spotify", "open_uri", { uri: item.spotify_uri })
        .catch(console.warn);
    } else {
      api.command("spotify", "next").catch(console.warn);
    }
  };

  const send = (cmd: string) => {
    api.command("spotify", cmd).catch(console.warn);
  };

  if (!np) {
    return (
      <div style={containerStyle("var(--bg)")}>
        <div style={{ opacity: 0.5 }}>Conectando a Spotify…</div>
      </div>
    );
  }

  if (!np.available) {
    return (
      <div style={containerStyle("var(--bg)")}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 80, marginBottom: 16, opacity: 0.6 }}>♪</div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 600 }}>Spotify no está corriendo</h1>
          <p style={{ opacity: 0.6, maxWidth: 420, margin: 0, fontSize: 14 }}>
            Abrí Spotify desktop y empezá a reproducir algo. Cátodo lo va a detectar automáticamente.
          </p>
        </div>
      </div>
    );
  }

  const playing = np.status === "Playing";
  const artUrl = np.art_url || "";

  return (
    <div style={containerStyle("transparent", "#fff")}>
      {artUrl && <Background artUrl={artUrl} />}
      <div style={overlayStyle} />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          height: "100%",
          padding: "40px 64px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, justifyContent: "space-between", flex: "0 0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 11, letterSpacing: 3, opacity: 0.5, fontFamily: "var(--font-mono)" }}>
              {playing ? "▶ NOW PLAYING" : "❚❚ PAUSED"}
            </span>
            <span style={{ fontSize: 13, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {np.album || ""}
            </span>
          </div>
        </div>

        {/* Main row */}
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 200,
            minHeight: 0,
            padding: "0 40px",
            boxSizing: "border-box",
          }}
        >
          {/* Disc + Controls column */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
            }}
          >
            <CdDisc artUrl={artUrl} playing={playing} />
            <div style={{ display: "flex", gap: 16 }}>
              <Ctrl onClick={() => send("prev")}>{"⏮"}</Ctrl>
              <Ctrl onClick={() => send("toggle")} primary>
                {playing ? "⏸" : "▶"}
              </Ctrl>
              <Ctrl onClick={() => send("next")}>{"⏭"}</Ctrl>
            </div>
          </div>

          {/* Track info + Lyrics */}
          <div style={{ flex: "1 1 0", maxWidth: 560, display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
            <div>
              <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, marginBottom: 8, letterSpacing: -0.5 }}>
                {np.title || "Sin pista"}
              </div>
              <div style={{ fontSize: 20, opacity: 0.75, fontWeight: 500 }}>
                {np.artist || "—"}
              </div>
            </div>
            <LyricsPanel lyrics={lyrics} status={lyricsStatus} position={np?.position ?? 0} />
          </div>
        </div>

        {/* History strip */}
        {history.length > 0 && (
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              gap: 12,
              overflowX: "auto",
              paddingBottom: 8,
              scrollbarWidth: "none",
            }}
          >
            {history.map((h) => (
              <button
                key={h.track_id}
                onClick={() => playHistory(h)}
                title={`${h.title} — ${h.artist}`}
                style={{
                  flex: "0 0 auto",
                  width: 64,
                  height: 64,
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.12)",
                  cursor: "pointer",
                  padding: 0,
                  background: "#000",
                  position: "relative",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {h.art_url ? (
                  <img
                    src={h.art_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      fontSize: 20,
                      opacity: 0.6,
                    }}
                  >
                    ♪
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: "3px 4px",
                    fontSize: 9,
                    background: "rgba(0,0,0,0.7)",
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {h.title}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes np-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes np-bg-pan {
          0%   { transform: scale(1.15) translate(0, 0); }
          50%  { transform: scale(1.25) translate(-2%, 1%); }
          100% { transform: scale(1.15) translate(0, 0); }
        }
      `}</style>
    </div>
  );
}

function LyricsPanel({
  lyrics,
  status,
  position,
}: {
  lyrics: Lyrics | null;
  status: "idle" | "loading" | "ok" | "missing";
  position: number;
}) {
  const [idx, setIdx] = useState(0);
  const total = lyrics?.lines.length ?? 0;
  const hasTimestamps = lyrics?.synced && lyrics.lines.length > 0 && lyrics.lines.some(l => l.t > 0);

  useEffect(() => {
    setIdx(0);
  }, [lyrics?.track, lyrics?.artist]);

  useEffect(() => {
    if (!hasTimestamps || total === 0) return;
    let target = 0;
    for (let i = 0; i < total; i++) {
      if (lyrics!.lines[i].t <= position) {
        target = i;
      } else {
        break;
      }
    }
    setIdx(target);
  }, [position, lyrics, total, hasTimestamps]);

  useEffect(() => {
    if (hasTimestamps || total === 0) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % total);
    }, 4000);
    return () => clearInterval(id);
  }, [total, hasTimestamps]);

  if (status === "loading" || status === "idle") {
    return (
      <div style={{ opacity: 0.4, fontSize: 14, fontStyle: "italic" }}>
        Buscando letras…
      </div>
    );
  }
  if (status === "missing" || !lyrics || lyrics.lines.length === 0) {
    return (
      <div style={{ opacity: 0.4, fontSize: 14, fontStyle: "italic" }}>
        Sin letras disponibles para esta pista.
      </div>
    );
  }

  const progress = total > 0 ? ((idx + 1) / total) * 100 : 0;
  const LINE_H = 46;
  const MAX_OFFSET = 3;

  return (
    <div
      style={{
        flex: "0 0 auto",
        height: 420,
        maxHeight: "60vh",
        position: "relative",
        width: "100%",
        maxWidth: 600,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "100%",
          height: LINE_H * (MAX_OFFSET * 2 + 1),
          transform: "translate(-50%, -50%)",
        }}
      >
        {lyrics.lines.map((line, i) => {
          const offset = i - idx;
          if (Math.abs(offset) > MAX_OFFSET) return null;
          const isCurrent = offset === 0;
          const absOffset = Math.abs(offset);
          const opacity = Math.max(0.25, 1 - absOffset * 0.25);
          const fontSize = isCurrent ? 30 : 20 - absOffset * 1.5;
          const fontWeight = isCurrent ? 700 : 400;
          const translateY = offset * LINE_H;
          return (
            <div
              key={`${i}-${lyrics.track ?? ""}`}
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                transform: `translateY(calc(-50% + ${translateY}px))`,
                fontSize,
                fontWeight,
                lineHeight: 1.3,
                textAlign: "center",
                color: isCurrent ? "#fff" : `rgba(255,255,255,${opacity * 0.6})`,
                opacity,
                letterSpacing: isCurrent ? -0.3 : 0,
                transition:
                  "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), font-size 0.5s ease, color 0.5s ease, opacity 0.5s ease",
                textShadow: isCurrent ? "0 2px 24px rgba(0,0,0,0.6)" : "none",
                willChange: "transform",
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            height: 2,
            background: "rgba(255,255,255,0.1)",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "#fff",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            opacity: 0.5,
            letterSpacing: 2,
            display: "flex",
            gap: 16,
            alignItems: "center",
          }}
        >
          <span>{String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>
            {Math.floor(position / 60)}:{String(Math.floor(position % 60)).padStart(2, "0")}
          </span>
          {hasTimestamps && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: "var(--accent)" }}>SYNC</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Background({ artUrl }: { artUrl: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url(${artUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "blur(60px) saturate(1.4) brightness(0.4)",
        transform: "scale(1.2)",
        animation: loaded ? "np-bg-pan 30s ease-in-out infinite" : undefined,
        opacity: loaded ? 1 : 0,
        transition: "opacity 1s ease",
        zIndex: 0,
      }}
    >
      <img
        src={artUrl}
        alt=""
        onLoad={() => setLoaded(true)}
        style={{ display: "none" }}
      />
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.75) 100%)",
  zIndex: 1,
};

function containerStyle(bg: string, color = "var(--text)"): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    background: bg,
    display: "grid",
    placeItems: "center",
    color,
    overflow: "hidden",
  };
}

function Ctrl({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: primary ? 72 : 56,
        height: primary ? 72 : 56,
        borderRadius: "50%",
        background: primary ? "#fff" : "rgba(255,255,255,0.08)",
        color: primary ? "#000" : "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: primary ? 28 : 22,
        fontWeight: primary ? 700 : 500,
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        transition: "transform 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function CdDisc({ artUrl, playing }: { artUrl: string; playing: boolean }) {
  const SIZE = 320;
  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        flexShrink: 0,
        position: "relative",
        borderRadius: "50%",
        background: "#0a0a0a",
        boxShadow:
          "0 24px 80px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.04)",
        animation: playing ? "np-spin 24s linear infinite" : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 9,
          borderRadius: "50%",
          overflow: "hidden",
          background: "#222",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/noise.png)",
            backgroundSize: "128px 128px",
            mixBlendMode: "multiply",
            opacity: 0.22,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        {artUrl ? (
          <img
            src={artUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              fontSize: 64,
              opacity: 0.4,
            }}
          >
            ♪
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          transform: "translate(-50%, -50%)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#000",
          transform: "translate(-50%, -50%)",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.02) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
