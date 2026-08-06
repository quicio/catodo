import { useEffect, useState } from "react";
import type { ChannelInfo } from "../api/client";
import { MorphIcon } from "morphicons/react";
import { Music, MonitorPlay, Clapperboard, Tv, Play } from "lucide";
import { ThumbsUp, ThumbsDown } from "lucide-react";

// Los wallpapers se cargan dinámicamente del backend (que los sirve desde
// frontend/src/wallpapers/), así los nuevos descargados aparecen sin rebuild.
const MIN_VISIBLE = 3;

type Rating = "up" | "down";
const RATINGS_KEY = "catodo.wallpaper.ratings";

function loadRatings(): Record<number, Rating> {
  try {
    return JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveRatings(r: Record<number, Rating>) {
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(r));
  } catch {}
}

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
  const [ratings, setRatings] = useState<Record<number, Rating>>(loadRatings);
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [wpIndex, setWpIndex] = useState(0);
  const [loadingWp, setLoadingWp] = useState(false);

  // Cargar la lista de wallpapers del backend
  const loadList = () =>
    fetch("/api/wallpapers/list")
      .then((r) => r.json())
      .then((d: { wallpapers: string[] }) => setWallpapers(d.wallpapers))
      .catch(() => {});

  useEffect(() => {
    loadList();
  }, []);

  // Gatillar descarga de más si quedan pocos aprobados, luego refrescar
  useEffect(() => {
    const visible = wallpapers.filter((_, i) => ratings[i] !== "down").length;
    if (visible < MIN_VISIBLE && !loadingWp && wallpapers.length > 0) {
      setLoadingWp(true);
      fetch("/api/wallpapers/fetch?n=4", { method: "POST" })
        .then(() => loadList())
        .catch(() => {})
        .finally(() => setLoadingWp(false));
    }
  }, [ratings, wallpapers, loadingWp]);

  useEffect(() => {
    if (wallpapers.length === 0) return;
    // arrancar en el primer no rechazado
    const idx = wallpapers.findIndex((_, i) => ratings[i] !== "down");
    setWpIndex(idx >= 0 ? idx : 0);
  }, [wallpapers]);

  useEffect(() => {
    const id = setInterval(() => {
      setWpIndex((prev) => {
        for (let step = 1; step <= wallpapers.length; step++) {
          const n = (prev + step) % wallpapers.length;
          if (ratings[n] !== "down") return n;
        }
        return prev;
      });
    }, 12000);
    return () => clearInterval(id);
  }, [ratings, wallpapers.length]);

  const rate = (i: number, r: Rating) => {
    setRatings((prev) => {
      const next = { ...prev };
      if (r === "up") {
        // si le diste up, se conserva (solo registra)
        next[i] = "up";
      } else {
        // down → no volver a mostrar; si era el actual, saltar
        next[i] = "down";
      }
      saveRatings(next);
      return next;
    });
    // si rechazamos el actual, ir al siguiente no rechazado
    setWpIndex((prev) => {
      if (prev !== i) return prev;
      for (let step = 1; step <= wallpapers.length; step++) {
        const n = (prev + step) % wallpapers.length;
        if (ratings[n] !== "down" && n !== i) return n;
      }
      return prev;
    });
  };

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
      {wallpapers.map((wp, i) => (
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

      {/* Calificación de wallpaper */}
      <div
        style={{
          position: "fixed",
          right: 24,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 3,
        }}
      >
        <button
          onClick={() => rate(wpIndex, "up")}
          title="Me gusta este wallpaper"
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: ratings[wpIndex] === "up" ? "rgba(29,185,84,0.35)" : "rgba(255,255,255,0.1)",
            border: `1px solid ${ratings[wpIndex] === "up" ? "#1db954" : "rgba(255,255,255,0.25)"}`,
            color: ratings[wpIndex] === "up" ? "#1db954" : "#fff",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <ThumbsUp size={22} />
        </button>
        <button
          onClick={() => rate(wpIndex, "down")}
          title="No me gusta este wallpaper (no vuelve a salir)"
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,60,60,0.25)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)")}
        >
          <ThumbsDown size={22} />
        </button>
      </div>
    </div>
  );
}
