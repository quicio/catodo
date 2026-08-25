import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
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
  const [artistWallpapers, setArtistWallpapers] = useState<string[]>([]);
  const [wpIndex, setWpIndex] = useState(0);
  const [compact, setCompact] = useState(false);
  const [lyricOffset, setLyricOffset] = useState(0);
  const [syncHint, setSyncHint] = useState<number | null>(null);
  const [syncHover, setSyncHover] = useState(false);
  const lastKeyRef = useRef<string>("");
  const lastArtistRef = useRef<string>("");
  const trackKeyRef = useRef<string>("");

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

  // Letras: cambian con la pista.
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
    return () => {
      cancelled = true;
    };
  }, [np?.title, np?.artist, np?.album]);

  // Sync manual de letras: al cambiar de pista se carga el offset guardado
  // para esa pista (ajustado con [ y ]).
  useEffect(() => {
    if (!np || !np.title || !np.artist) return;
    const key = `${np.artist}|${np.title}|${np.album ?? ""}`;
    trackKeyRef.current = key;
    try {
      const saved = Number(window.localStorage.getItem(`catodo:lyric-offset:${key}`) ?? 0) || 0;
      setLyricOffset(saved);
    } catch {}
  }, [np?.title, np?.artist, np?.album]);

  useEffect(() => {
    if (!trackKeyRef.current) return;
    try {
      if (lyricOffset === 0) {
        window.localStorage.removeItem(`catodo:lyric-offset:${trackKeyRef.current}`);
      } else {
        window.localStorage.setItem(`catodo:lyric-offset:${trackKeyRef.current}`, String(lyricOffset));
      }
    } catch {}
  }, [lyricOffset]);

  // Atajos: [ ] (o , .) ajustan el sync de las letras (±0.5s), \ lo resetea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let delta = 0;
      if (e.key === "]" || e.key === ".") delta = 0.5;
      else if (e.key === "[" || e.key === ",") delta = -0.5;
      else if (e.key === "\\") {
        setLyricOffset(0);
        setSyncHint(0);
        e.preventDefault();
        return;
      }
      if (delta === 0) return;
      e.preventDefault();
      setLyricOffset((o) => Math.round((o + delta) * 10) / 10);
      setSyncHint(delta);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (syncHint === null) return;
    const id = window.setTimeout(() => setSyncHint(null), 1600);
    return () => clearTimeout(id);
  }, [syncHint]);

  // Wallpapers del artista: rota entre ellos cada ~12s. Si la API devuelve
  // `in_progress: true` (descarga en background), reintenta unos segundos
  // después y también escucha `catodo:wallpapers_changed` para re-consultar
  // cuando el backend termine.
  useEffect(() => {
    if (!np?.artist) return;
    const artist = np.artist;
    if (artist === lastArtistRef.current) return;
    lastArtistRef.current = artist;
    let cancelled = false;
    setArtistWallpapers([]);
    setWpIndex(0);

    const fetchWallpapers = async () => {
      try {
        const r = await fetch(`/api/wallpapers/artist?name=${encodeURIComponent(artist)}&n=6`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        const list: string[] = Array.isArray(data.wallpapers) ? data.wallpapers : [];
        if (!cancelled) setArtistWallpapers(list);
        // Si el backend todavía está descargando, reintento en 12s.
        if (!cancelled && data.in_progress) {
          setTimeout(() => {
            if (!cancelled) fetchWallpapers();
          }, 12000);
        }
      } catch {}
    };
    fetchWallpapers();
    return () => {
      cancelled = true;
    };
  }, [np?.artist]);

  // Re-fetch cuando el backend avisa que descargó wallpapers nuevos (puede
  // incluir los del artista actual).
  useEffect(() => {
    const onWp = () => {
      const artist = lastArtistRef.current;
      if (!artist) return;
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch(`/api/wallpapers/artist?name=${encodeURIComponent(artist)}&n=6`);
          if (!r.ok || cancelled) return;
          const data = await r.json();
          const list: string[] = Array.isArray(data.wallpapers) ? data.wallpapers : [];
          if (!cancelled && list.length > 0) setArtistWallpapers(list);
        } catch {}
      })();
      return () => {
        cancelled = true;
      };
    };
    window.addEventListener("catodo:wallpapers_changed", onWp);
    return () => window.removeEventListener("catodo:wallpapers_changed", onWp);
  }, []);

  // Rotación lenta de wallpapers (12s).
  useEffect(() => {
    if (artistWallpapers.length <= 1) return;
    const id = setInterval(() => {
      setWpIndex((i) => (i + 1) % artistWallpapers.length);
    }, 12000);
    return () => clearInterval(id);
  }, [artistWallpapers]);

  // Layout compacto para ventanas bajas (ej. split 4-way): se encoge la
  // tipografía y el panel de letras para que no se pisen con los controles.
  useEffect(() => {
    const update = () => setCompact(window.innerHeight < 760);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const send = (cmd: string) => {
    api.command("spotify", cmd).catch(console.warn);
  };

  const centerCol = compact
    ? { ...centerColumnStyle, padding: "20px 32px 12px", minHeight: "calc(100% - 130px)" }
    : centerColumnStyle;
  const title = compact ? { ...titleStyle, fontSize: 38, lineHeight: 1.12 } : titleStyle;
  const artist = compact ? { ...artistStyle, fontSize: 20, marginTop: 8 } : artistStyle;
  const album = compact ? { ...albumStyle, marginTop: 8 } : albumStyle;
  const statusRow = compact ? { ...statusRowStyle, marginBottom: 12 } : statusRowStyle;
  const bottomBar = compact
    ? { ...bottomBarStyle, padding: "0 24px 10px", bottom: "calc(var(--channel-bar-height) - 10px)" }
    : bottomBarStyle;

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
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 600 }}>
            Spotify no está corriendo
          </h1>
          <p style={{ opacity: 0.6, maxWidth: 420, margin: 0, fontSize: 14 }}>
            Abrí Spotify desktop y empezá a reproducir algo. Cátodo lo va a detectar automáticamente.
          </p>
        </div>
      </div>
    );
  }

  const playing = np.status === "Playing";
  const artUrl = np.art_url || "";
  const bgUrl = artistWallpapers[wpIndex] || artUrl;

  return (
    <div style={containerStyle("transparent", "#fff")}>
      {/* Full-bleed: wallpaper del artista (rotando) o cover como fallback. */}
      {bgUrl && <FullBleedArt artUrl={bgUrl} />}
      <div style={overlayStyle} />

      <div style={centerCol}>
        <div style={statusRow}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: playing ? "var(--accent)" : "rgba(255,255,255,0.4)",
              boxShadow: playing ? "0 0 10px var(--accent)" : "none",
            }}
          />
          <span style={statusLabelStyle}>
            {playing ? "REPRODUCIENDO" : "EN PAUSA"}
          </span>
        </div>

        <div style={title}>{np.title || "Sin pista"}</div>
        <div style={artist}>{np.artist || "—"}</div>
        {np.album && <div style={album}>{np.album}</div>}

        <LyricsPanel
          lyrics={lyrics}
          status={lyricsStatus}
          position={np?.position ?? 0}
          offset={lyricOffset}
          compact={compact}
        />
      </div>

      {syncHint !== null && (
        <div style={syncHintStyle}>
          SYNC{" "}
          {lyricOffset > 0 ? "+" : ""}
          {lyricOffset.toFixed(1)}s
        </div>
      )}

      {lyricOffset !== 0 && (
        <div
          style={syncDotWrapperStyle}
          onMouseEnter={() => setSyncHover(true)}
          onMouseLeave={() => setSyncHover(false)}
        >
          <div style={syncDotStyle} />
          {syncHover && (
            <div style={syncBadgeStyle}>
              SYNC {lyricOffset > 0 ? "+" : ""}
              {lyricOffset.toFixed(1)}s
            </div>
          )}
        </div>
      )}

      <div style={bottomBar}>
        <div style={controlsStyle}>
          <Ctrl onClick={() => send("prev")} size={compact ? 42 : 56}>
            <Icon name="skip-back" size={compact ? 20 : 26} strokeWidth={2.2} />
          </Ctrl>
          <Ctrl onClick={() => send("toggle")} size={compact ? 54 : 72}>
            <Icon
              name="play"
              morphTo={playing ? "pause" : undefined}
              size={compact ? 24 : 30}
              strokeWidth={2.2}
            />
          </Ctrl>
          <Ctrl onClick={() => send("next")} size={compact ? 42 : 56}>
            <Icon name="skip-forward" size={compact ? 20 : 26} strokeWidth={2.2} />
          </Ctrl>
        </div>
      </div>
    </div>
  );
}

// === Sub-componentes ===

function FullBleedArt({ artUrl }: { artUrl: string }) {
  const [loaded, setLoaded] = useState(false);
  // Cross-fade al cambiar de wallpaper.
  const [currentUrl, setCurrentUrl] = useState(artUrl);
  useEffect(() => {
    if (artUrl !== currentUrl) {
      setLoaded(false);
      setCurrentUrl(artUrl);
    }
  }, [artUrl, currentUrl]);
  return (
    <div style={fullBleedStyle}>
      <img
        src={currentUrl}
        alt=""
        onLoad={() => setLoaded(true)}
        style={{ display: "none" }}
      />
      {/* Capa base con blur: si no carga la imagen, queda el fondo oscuro
         del contenedor en lugar de pantalla en negro. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#0a0a0a",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${currentUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(35px) saturate(1.4) brightness(0.5)",
          transform: "scale(1.18)",
          opacity: loaded ? 1 : 0,
          transition: "opacity 1.2s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${currentUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: loaded ? 1 : 0,
          transition: "opacity 1.2s ease",
        }}
      />
      <style>{`
        @keyframes np-pan {
          0%   { transform: scale(1.02) translate(0, 0); }
          50%  { transform: scale(1.06) translate(-1%, 0.5%); }
          100% { transform: scale(1.02) translate(0, 0); }
        }
      `}</style>
    </div>
  );
}

function LyricsPanel({
  lyrics,
  status,
  position,
  offset = 0,
  compact = false,
}: {
  lyrics: Lyrics | null;
  status: "idle" | "loading" | "ok" | "missing";
  position: number;
  offset?: number;
  compact?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const total = lyrics?.lines.length ?? 0;
  const hasTimestamps =
    lyrics?.synced && lyrics.lines.length > 0 && lyrics.lines.some((l) => l.t > 0);

  useEffect(() => {
    setIdx(0);
  }, [lyrics?.track, lyrics?.artist]);

  useEffect(() => {
    if (!hasTimestamps || total === 0) return;
    let target = 0;
    // Lookahead: el backend publica `position` cada ~1s, así que la letra
    // llega ~1s tarde sin este offset. Sumamos 1.2s para que la línea
    // actual se alinee con el audio. `offset` es el sync manual del usuario
    // (ajustado con [ y ], persistido por pista).
    const effective = position + 1.2 + offset;
    for (let i = 0; i < total; i++) {
      if (lyrics!.lines[i].t <= effective) {
        target = i;
      } else {
        break;
      }
    }
    setIdx(target);
  }, [position, lyrics, total, hasTimestamps, offset]);

  useEffect(() => {
    if (hasTimestamps || total === 0) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % total);
    }, 4000);
    return () => clearInterval(id);
  }, [total, hasTimestamps]);

  if (status === "loading" || status === "idle") {
    return <div style={lyricsHintStyle}>Buscando letras…</div>;
  }
  if (status === "missing" || !lyrics || lyrics.lines.length === 0) {
    return <div style={lyricsHintStyle}>Sin letras disponibles para esta pista.</div>;
  }

  const progress = total > 0 ? ((idx + 1) / total) * 100 : 0;
  // Slot vertical: la línea activa tiene más aire y reserva espacio fijo
  // para evitar saltos visuales cuando wrappea a 2 líneas.
  const ACTIVE_SLOT = compact ? 56 : 88;
  const INACTIVE_SLOT = compact ? 34 : 52;
  const ACTIVE_MIN_H = compact ? 44 : 64; // 2 líneas de 34px con lineHeight 1.3 (~44px c/u)
  const MAX_OFFSET = compact ? 2 : 3;
  const viewport = compact
    ? { ...lyricsViewportStyle, height: 220 }
    : lyricsViewportStyle;
  const panel = compact
    ? { ...lyricsPanelStyle, marginTop: 20, minHeight: 120 }
    : lyricsPanelStyle;

  function offsetToY(offset: number): number {
    if (offset === 0) return 0;
    const sign = offset > 0 ? 1 : -1;
    const abs = Math.abs(offset);
    return sign * (ACTIVE_SLOT / 2 + INACTIVE_SLOT / 2 + (abs - 1) * INACTIVE_SLOT);
  }

  return (
    <div style={panel}>
      <div style={viewport}>
        {lyrics.lines.map((line, i) => {
          const offset = i - idx;
          if (Math.abs(offset) > MAX_OFFSET) return null;
          const isCurrent = offset === 0;
          const absOffset = Math.abs(offset);
          const opacity = Math.max(0.25, 1 - absOffset * 0.22);
          const fontSize = isCurrent ? 34 : 22 - absOffset * 1.5;
          const fontWeight = isCurrent ? 700 : 400;
          const translateY = offsetToY(offset);
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
                letterSpacing: isCurrent ? -0.2 : 0,
                // La línea activa reserva altura fija así no salta al wrappear.
                minHeight: isCurrent ? ACTIVE_MIN_H : undefined,
                display: isCurrent ? "flex" : undefined,
                alignItems: isCurrent ? "center" : undefined,
                justifyContent: isCurrent ? "center" : undefined,
                transition:
                  "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), font-size 0.5s ease, color 0.5s ease, opacity 0.5s ease, min-height 0.4s ease",
                textShadow: isCurrent ? "0 2px 16px rgba(0,0,0,0.5)" : "none",
                willChange: "transform, font-size",
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>

      <div style={lyricsFooterStyle}>
        <div style={lyricsProgressTrackStyle}>
          <div style={{ ...lyricsProgressFillStyle, width: `${progress}%` }} />
        </div>
        <div style={lyricsMetaStyle}>
          <span>
            {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>
            {Math.floor(position / 60)}:
            {String(Math.floor(position % 60)).padStart(2, "0")}
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

// === Estilos ===

function containerStyle(bg: string, color = "var(--text)"): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    background: bg,
    color,
    overflow: "hidden",
  };
}

const fullBleedStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.85) 100%)",
  zIndex: 1,
};

const centerColumnStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "64px 64px 24px",
  maxWidth: 1200,
  margin: "0 auto",
  minHeight: "calc(100% - 220px)",
  gap: 4,
};

const statusRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 20,
};

const statusLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: 3,
  opacity: 0.7,
};

const titleStyle: React.CSSProperties = {
  fontSize: 68,
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: -1.5,
  textShadow: "0 4px 30px rgba(0,0,0,0.55)",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const artistStyle: React.CSSProperties = {
  fontSize: 28,
  opacity: 0.85,
  fontWeight: 500,
  marginTop: 12,
};

const albumStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: 2,
  opacity: 0.3,
  marginTop: 14,
};

const lyricsPanelStyle: React.CSSProperties = {
  marginTop: 72,
  width: "100%",
  maxWidth: 640,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 180,
};

const lyricsViewportStyle: React.CSSProperties = {
  position: "relative",
  height: 400,
  overflow: "hidden",
};

const lyricsHintStyle: React.CSSProperties = {
  marginTop: 32,
  opacity: 0.4,
  fontSize: 14,
  fontStyle: "italic",
};

const syncHintStyle: React.CSSProperties = {
  position: "absolute",
  top: 24,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 3,
  padding: "6px 14px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  color: "#fff",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  letterSpacing: 1,
  opacity: 0.95,
};

const syncBadgeStyle: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  color: "#fff",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: 1,
  whiteSpace: "nowrap",
};

const syncDotWrapperStyle: React.CSSProperties = {
  position: "absolute",
  top: 24,
  right: 24,
  zIndex: 3,
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "default",
};

const syncDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.4)",
  flexShrink: 0,
};

const lyricsFooterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const lyricsProgressTrackStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 320,
  alignSelf: "center",
  height: 2,
  background: "rgba(255,255,255,0.08)",
  borderRadius: 1,
  overflow: "hidden",
};

const lyricsProgressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "rgba(255,255,255,0.5)",
  transition: "width 0.4s ease",
};

const lyricsMetaStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  opacity: 0.5,
  letterSpacing: 2,
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "center",
};

const bottomBarStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "var(--channel-bar-height)",
  zIndex: 2,
  padding: "0 64px 28px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 18,
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  gap: 18,
  alignItems: "center",
};

function Ctrl({
  children,
  onClick,
  size = 56,
}: {
  children: React.ReactNode;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "transparent",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.15s ease, opacity 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}