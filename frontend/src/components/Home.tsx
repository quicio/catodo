import { useEffect, useState } from "react";
import type { ChannelInfo } from "../api/client";
import { MorphIcon } from "morphicons/react";
import { Music, MonitorPlay, Clapperboard, Tv, Play } from "lucide";
import wp1 from "../wallpapers/72we8y.jpg";
import wp2 from "../wallpapers/95j2v1.jpg";
import wp3 from "../wallpapers/l3kz22.jpg";
import wp4 from "../wallpapers/4vo7vl.jpg";
import wp5 from "../wallpapers/o59z35.jpg";
import wp6 from "../wallpapers/zmgv6v.jpg";

const WALLPAPERS = [wp1, wp2, wp3, wp4, wp5, wp6];

const ICONS: Record<string, typeof Music> = {
  spotify: Music,
  youtube: MonitorPlay,
  anime: Clapperboard,
  tv: Tv,
};

const COLORS: Record<string, string> = {
  spotify: "#1db954",
  youtube: "#ff0033",
  anime: "#ffd166",
  tv: "#4d7cff",
};

export default function Home({
  channels,
  onPick,
}: {
  channels: ChannelInfo[];
  onPick: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [wpIndex, setWpIndex] = useState(() => Math.floor(Math.random() * WALLPAPERS.length));

  useEffect(() => {
    const id = setInterval(() => {
      setWpIndex((i) => (i + 1) % WALLPAPERS.length);
    }, 12000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        color: "#fff",
        padding: 40,
      }}
    >
      {/* Fondos rotativos con crossfade */}
      {WALLPAPERS.map((wp, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${wp})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: i === wpIndex ? 1 : 0,
            transition: "opacity 1.2s ease",
            zIndex: 0,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)",
          zIndex: 1,
        }}
      />

      <div style={{ textAlign: "center", position: "relative", zIndex: 2, fontFamily: '"Space Grotesk", sans-serif' }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -3,
            textShadow: "0 0 40px rgba(255,255,255,0.3)",
            lineHeight: 1,
          }}
        >
          Cátodo
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 14,
            opacity: 0.55,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          SELECCIONÁ UN CANAL
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 20,
          width: "min(820px, 90vw)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {channels.map((c, i) => {
          const icon = ICONS[c.id] || Tv;
          const color = COLORS[c.id] || "#fff";
          const isHover = hovered === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "28px 20px",
                borderRadius: 18,
                background: isHover ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isHover ? color + "66" : "rgba(255,255,255,0.1)"}`,
                cursor: "pointer",
                color: "#fff",
                transform: isHover ? "translateY(-6px)" : "translateY(0)",
                transition: "transform 0.15s ease, background 0.15s ease, border 0.15s ease",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `${color}2e`,
                  color,
                  border: `1px solid ${color}77`,
                  boxShadow: `0 0 18px ${color}44`,
                }}
              >
                <MorphIcon
                  icon={isHover ? Play : icon}
                  size={26}
                  strokeWidth={2}
                  color={color}
                  spring="smooth"
                />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  opacity: 0.5,
                  letterSpacing: 2,
                }}
              >
                CH {String(i + 1).padStart(2, "0")}
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.4,
          fontFamily: "var(--font-mono)",
          position: "relative",
          zIndex: 2,
        }}
      >
        PRECIONÁ 1-4 O HACÉ CLICK · ESC PARA VOLVER
      </div>
    </div>
  );
}
