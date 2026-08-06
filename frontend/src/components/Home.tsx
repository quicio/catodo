import { useEffect, useState } from "react";
import type { ChannelInfo } from "../api/client";
import { MorphIcon } from "morphicons/react";
import { Music, MonitorPlay, Clapperboard, Tv, Play, ThumbsUp, ThumbsDown, Check, X } from "lucide";

// Los wallpapers se cargan dinámicamente del backend (que los sirve desde
// frontend/src/wallpapers/), así los nuevos descargados aparecen sin rebuild.
const MIN_VISIBLE = 3;

type Rating = "up" | "down" | "none";
const RATINGS_KEY = "catodo.wallpaper.ratings";

// id estable de un wallpaper a partir de su URL (/api/wallpapers/files/<id>.jpg)
const wpId = (url: string) => url.split("/").pop()?.split(".")[0] || url;

function loadRatings(): Record<string, Rating> {
  try {
    return JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveRatings(r: Record<string, Rating>) {
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
  const [ratings, setRatings] = useState<Record<string, Rating>>(loadRatings);
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [wpIndex, setWpIndex] = useState(0);
  const [loadingWp, setLoadingWp] = useState(false);
  const [now, setNow] = useState(new Date());
  const [spotify, setSpotify] = useState<{ art_url?: string; status?: string; title?: string; artist?: string } | null>(null);

  // Reloj
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Estado de Spotify para el fondo
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/channels/spotify/state")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => setSpotify(s))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Buscar wallpapers del artista cuando cambia la canción; si no hay, portada borrosa
  const [artistWp, setArtistWp] = useState<string[]>([]);
  const [coverReady, setCoverReady] = useState(false);
  useEffect(() => {
    if (spotify?.status === "Playing" && spotify.artist) {
      const key = spotify.artist;
      // limpiar el listado del track anterior ya → portada borrosa del nuevo track
      setArtistWp([]);
      setCoverReady(false);
      // 1) portada en alta resolución (iTunes); 2) wallpapers del artista (last.fm/wallhaven)
      let cover: string | null = spotify?.art_url ?? null;
      Promise.all([
        fetch(`/api/wallpapers/cover?artist=${encodeURIComponent(key)}&track=${encodeURIComponent(spotify.title ?? "")}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.url)
          .catch(() => null),
        fetch(`/api/wallpapers/artist?name=${encodeURIComponent(key)}&n=6`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.wallpapers ?? [])
          .catch(() => []),
      ]).then(([hi, photos]) => {
        if (hi) cover = hi;
        // la portada siempre va primero; luego las del artista
        const list = [cover, ...photos].filter(Boolean) as string[];
        if (list.length > 1) {
          setArtistWp(list);
          // precargar la portada antes de mostrarla → crossfade borrosa→nítida sin negro
          const img = new Image();
          const reveal = () => {
            const idx = list.findIndex((u) => ratings[wpId(u)] !== "down");
            setWpIndex(idx >= 0 ? idx : 0);
            setCoverReady(true);
          };
          img.onload = reveal;
          img.onerror = reveal;
          img.src = list[0];
        }
      });
    } else {
      setArtistWp([]);
    }
  }, [spotify?.artist, spotify?.status, spotify?.title]);

  // mientras suena Spotify el fondo es SIEMPRE del artista (portada borrosa si no hay fotos)
  const showSpotifyBg = spotify?.status === "Playing";

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
    const visible = wallpapers.filter((u) => ratings[wpId(u)] !== "down").length;
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
    const idx = wallpapers.findIndex((u) => ratings[wpId(u)] !== "down");
    setWpIndex(idx >= 0 ? idx : 0);
  }, [wallpapers]);

  useEffect(() => {
    const id = setInterval(() => {
      setWpIndex((prev) => {
        const activeList = showSpotifyBg && artistWp.length > 0 ? artistWp : wallpapers;
        if (activeList.length === 0) return prev;
        const cur = prev % activeList.length;
        // avanzar siempre al siguiente no rechazado
        for (let step = 1; step <= activeList.length; step++) {
          const n = (cur + step) % activeList.length;
          if (ratings[wpId(activeList[n])] !== "down") return n;
        }
        return cur;
      });
    }, 12000);
    return () => clearInterval(id);
  }, [ratings, wallpapers, artistWp, showSpotifyBg]);

  const rate = (id: string, r: Rating) => {
    setRatings((prev) => {
      const next = { ...prev };
      if (r === "none") {
        delete next[id]; // deseleccionar
      } else {
        next[id] = r;
      }
      saveRatings(next);
      return next;
    });
    // al RECHAZAR (down): mostrar el morph a X y luego avanzar tras un delay
    if (r === "down") {
      setTimeout(() => {
        setWpIndex((prev) => {
          const activeList = showSpotifyBg && artistWp.length > 0 ? artistWp : wallpapers;
          const curWp = activeList[prev % activeList.length];
          const curId = curWp ? wpId(curWp) : null;
          if (curId !== id) return prev;
          for (let step = 1; step <= activeList.length; step++) {
            const n = (prev + step) % activeList.length;
            const nId = wpId(activeList[n]);
            if (ratings[nId] !== "down" && nId !== id) return n;
          }
          return prev;
        });
      }, 600);
    }
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
      {/* Fondo: Spotify (portada borrosa siempre de fondo, crossfade a la rotación nítida) o wallpapers rotativos */}
      {showSpotifyBg ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${spotify?.art_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(30px) saturate(1.3) brightness(0.6)",
              transform: "scale(1.15)",
              zIndex: 0,
            }}
          />
          {artistWp.length > 0 &&
            artistWp.map((wp, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${wp})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: coverReady && i === wpIndex % artistWp.length ? 1 : 0,
                  transition: "opacity 3s ease",
                  zIndex: 0,
                }}
              />
            ))}
        </>
      ) : (
        wallpapers.map((wp, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${wp})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: i === wpIndex % wallpapers.length ? 1 : 0,
              transition: "opacity 1.2s ease",
              zIndex: 0,
            }}
          />
        ))
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)",
          zIndex: 1,
        }}
      />

      {/* Reloj */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 40,
          zIndex: 2,
          fontFamily: "var(--font-mono)",
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, letterSpacing: 1 }}>
          {now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div style={{ fontSize: 14, opacity: 0.55, marginTop: 6, letterSpacing: 2 }}>
          {now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>

      {/* Ahora sonando en Spotify */}
      {showSpotifyBg && spotify?.title && (
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 40,
            zIndex: 2,
            textAlign: "right",
            fontFamily: '"Space Grotesk", sans-serif',
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 3, fontFamily: "var(--font-mono)" }}>
            ♫ NOW PLAYING
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{spotify.title}</div>
          <div style={{ fontSize: 14, opacity: 0.6 }}>{spotify.artist}</div>
        </div>
      )}

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
        {(() => {
          const activeList = showSpotifyBg && artistWp.length > 0 ? artistWp : wallpapers;
          const curWp = activeList[wpIndex % activeList.length];
          const curId = curWp ? wpId(curWp) : null;
          const cur = curId ? ratings[curId] : undefined;
          const isUp = cur === "up";
          const isDown = cur === "down";
          return (
            <>
              <button
                onClick={() => curId && rate(curId, isUp ? "none" : "up")}
                title="Me gusta este wallpaper"
                style={{
                  width: 52,
                  height: 52,
                  boxSizing: "border-box",
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isUp ? "rgba(29,185,84,0.35)" : isDown ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)",
                  border: `1px solid ${isUp ? "#1db954" : "rgba(255,255,255,0.25)"}`,
                  color: isUp ? "#1db954" : "#fff",
                  cursor: "pointer",
                  outline: "none",
                  WebkitTapHighlightColor: "transparent",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                  opacity: isDown ? 0.4 : 1,
                }}
              >
                <MorphIcon
                  icon={isUp ? Check : ThumbsUp}
                  size={22}
                  strokeWidth={2}
                  color={isUp ? "#1db954" : "#fff"}
                  spring="smooth"
                  style={{ display: "block", lineHeight: 0 }}
                />
              </button>
              <button
                onClick={() => curId && rate(curId, isDown ? "none" : "down")}
                title="No me gusta este wallpaper (no vuelve a salir)"
                style={{
                  width: 52,
                  height: 52,
                  boxSizing: "border-box",
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isDown ? "rgba(255,60,60,0.35)" : isUp ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)",
                  border: `1px solid ${isDown ? "#ff6b6b" : "rgba(255,255,255,0.25)"}`,
                  color: isDown ? "#ff6b6b" : "#fff",
                  cursor: "pointer",
                  outline: "none",
                  WebkitTapHighlightColor: "transparent",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                  opacity: isUp ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isDown && !isUp) ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,60,60,0.25)");
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = isDown ? "rgba(255,60,60,0.35)" : isUp ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)";
                }}
              >
                <MorphIcon
                  icon={isDown ? X : ThumbsDown}
                  size={22}
                  strokeWidth={2}
                  color={isDown ? "#ff6b6b" : "#fff"}
                  spring="smooth"
                  style={{ display: "block", lineHeight: 0 }}
                />
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
