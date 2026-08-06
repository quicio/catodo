import { useEffect, useRef, useState } from "react";
import Anime4KCanvas from "../webgl/Anime4KCanvas";

interface Episode {
  path: string;
  name: string;
  series: string;
  season: string;
  rel: string;
}

interface AnimeState {
  base: string;
  count: number;
  series: Record<string, { name: string; episodes: Episode[] }>;
  current: Episode | null;
  playing: boolean;
}

interface EffectDef {
  name: string;
  css: React.CSSProperties;
  overlays: React.ReactNode[];
  a4k?: boolean;
}

export default function Anime() {
  const [state, setState] = useState<AnimeState | null>(null);
  const [showList, setShowList] = useState(false);
  const [key, setKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [srcTs, setSrcTs] = useState(Date.now());
  const [effectIndex, setEffectIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const EFFECTS: EffectDef[] = [
    {
      name: "NORMAL",
      css: {},
      overlays: [],
    },
    {
      name: "CRT",
      css: { filter: "contrast(1.1) saturate(1.15)" },
      overlays: [
        <div key="scan" className="fx-scanlines" />,
        <div key="curv" className="fx-curvature" />,
        <div key="flick" className="fx-flicker" />,
      ],
    },
    {
      name: "4X",
      css: { filter: "contrast(1.2) saturate(1.2) brightness(1.05)" },
      overlays: [<div key="pix" className="fx-pixel" />],
    },
    {
      name: "VHS",
      css: { filter: "saturate(0.8) contrast(1.05) hue-rotate(5deg)" },
      overlays: [
        <div key="noise" className="fx-noise" />,
        <div key="chroma" className="fx-chroma" />,
        <div key="track" className="fx-tracking" />,
      ],
    },
    {
      name: "B&W",
      css: { filter: "grayscale(1) contrast(1.1)" },
      overlays: [],
    },
    {
      name: "A4K",
      css: {},
      overlays: [],
      a4k: true,
    },
  ];
  const effect = EFFECTS[effectIndex];

  const cycleEffect = () => {
    setEffectIndex((i) => (i + 1) % EFFECTS.length);
    setControlsVisible(true);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/channels/anime/state");
        if (!r.ok || cancelled) return;
        setState(await r.json());
      } catch {}
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const wake = () => {
      setControlsVisible(true);
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => setControlsVisible(false), 4000);
    };
    wake();
    const events = ["mousemove", "mousedown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, wake));
    return () => {
      if (timer !== null) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  const pickEpisode = async (rel: string) => {
    try {
      await fetch("/api/channels/anime/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "set_episode", episode: rel }),
      });
      setShowList(false);
      setKey((k) => k + 1);
      setSrcTs(Date.now());
    } catch {}
  };

  const nav = async (cmd: string) => {
    try {
      const r = await fetch("/api/channels/anime/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      if (!r.ok) return;
      const st = await fetch("/api/channels/anime/state");
      if (st.ok) setState(await st.json());
      setKey((k) => k + 1);
      setSrcTs(Date.now());
      const v = videoRef.current;
      if (v) {
        v.currentTime = 0;
        v.play().catch(() => {});
        setIsPlaying(true);
      }
    } catch {}
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (fraction: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    v.currentTime = fraction * v.duration;
    setProgress(fraction);
  };

  if (!state || !state.current) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#000",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: 18,
          opacity: 0.6,
        }}
      >
        {state ? "No hay episodios en la carpeta Anime" : "Cargando…"}
      </div>
    );
  }

  const series = Object.values(state.series);
  const current = state.current;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", color: "#fff" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <video
          ref={videoRef}
          key={key}
          src={`/api/channels/anime/stream?_=${key}&ts=${srcTs}`}
          autoPlay
          playsInline
          onClick={() => setControlsVisible(true)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => nav("next")}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
            transition: "filter 0.4s ease",
            ...(effect.a4k
              ? { width: 2, height: 2, left: 0, top: 0, opacity: 0, pointerEvents: "none" }
              : {}),
            ...(effect.css as React.CSSProperties),
          }}
        />
        {effect.a4k && (
          <Anime4KCanvas
            src={`/api/channels/anime/stream?_=${key}&ts=${srcTs}`}
            videoEl={videoRef}
          />
        )}
        {effect.overlays}
      </div>

      {/* Top bar with series + episode info */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          pointerEvents: "none",
        }}
      >
        <button
          onClick={() => setShowList((s) => !s)}
          style={{
            pointerEvents: "auto",
            padding: "8px 16px",
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
            backdropFilter: "blur(8px)",
          }}
        >
          ☰ {current.series} · {current.name}
        </button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{current.season}</span>
      </div>

      {/* Episode list overlay */}
      {showList && (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 16,
            bottom: 16,
            width: 360,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(12px)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            zIndex: 10,
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Episodios ({state.count})
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {series.map((s) => (
              <div key={s.name}>
                <div
                  style={{
                    padding: "10px 8px 4px",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    opacity: 0.5,
                  }}
                >
                  {s.name}
                </div>
                {s.episodes.map((ep) => (
                  <button
                    key={ep.rel}
                    onClick={() => pickEpisode(ep.rel)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: ep.rel === current.rel ? "rgba(255,255,255,0.15)" : "transparent",
                      border: "none",
                      color: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ep.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cátodo-style control panel */}
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          left: "50%",
          transform: `translateX(-50%) ${
            controlsVisible ? "translateY(0)" : "translateY(24px)"
          }`,
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.4s ease, transform 0.4s ease",
          pointerEvents: controlsVisible ? "auto" : "none",
          width: "min(560px, 80vw)",
          background: "rgba(10,10,10,0.45)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: "16px 20px 14px",
          backdropFilter: "blur(12px)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top row: ep label + time */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            fontSize: 15,
            letterSpacing: 0.5,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 5,
                background: "rgba(29,185,84,0.2)",
                color: "#1db954",
              }}
            >
              EP
            </span>
            {current.name}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, opacity: 0.7 }}>
            {fmtTime(progress * duration)} / {fmtTime(duration)}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            marginBottom: 16,
            cursor: "pointer",
          }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
        >
          <div
            style={{
              height: 7,
              background: "rgba(255,255,255,0.1)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, progress * 100)}%`,
                height: "100%",
                background: "linear-gradient(90deg, #1db954, #4dffb1)",
                boxShadow: "0 0 12px rgba(29,185,84,0.5)",
                transition: "width 0.1s linear",
              }}
            />
          </div>
        </div>

        {/* Buttons row */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            alignItems: "center",
          }}
        >
          <CtrlBtn onClick={() => nav("prev")} label="⏮" />
          <CtrlBtn
            onClick={togglePlay}
            label={isPlaying ? "⏸" : "▶"}
            primary
          />
          <CtrlBtn onClick={() => nav("next")} label="⏭" />
          <div
            style={{
              marginLeft: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <CtrlBtn onClick={cycleEffect} label="✦" small />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: 1,
                color: "#1db954",
                opacity: 0.9,
              }}
            >
              {effect.name}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function CtrlBtn({
  label,
  onClick,
  primary,
  small,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: primary ? 72 : small ? 44 : 58,
        height: primary ? 72 : small ? 44 : 58,
        borderRadius: "50%",
        background: primary ? "#1db954" : "rgba(255,255,255,0.08)",
        color: primary ? "#000" : "#fff",
        border: "none",
        fontSize: primary ? 28 : small ? 16 : 22,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        transition: "transform 0.15s ease, background 0.15s ease",
        boxShadow: primary ? "0 6px 20px rgba(29,185,84,0.4)" : "none",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.transform = "scale(1.06)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {label}
    </button>
  );
}
