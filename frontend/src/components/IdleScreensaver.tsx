import { useEffect, useState } from "react";

interface Props {
  state: "active" | "screensaver" | "sleep";
}

export default function IdleScreensaver({ state }: Props) {
  const [now, setNow] = useState(new Date());
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [wpIndex, setWpIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/wallpapers/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWallpapers(d?.wallpapers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (wallpapers.length === 0) return;
    const id = setInterval(() => setWpIndex((i) => (i + 1) % wallpapers.length), 15000);
    return () => clearInterval(id);
  }, [wallpapers.length]);

  if (state === "active") return null;

  const wp = wallpapers.length > 0 ? wallpapers[wpIndex % wallpapers.length] : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#000",
        overflow: "hidden",
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      {state === "screensaver" && wp && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${wp})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            state === "sleep"
              ? "#000"
              : "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%)",
        }}
      />
      {state === "screensaver" && (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 76, fontWeight: 700, lineHeight: 1 }}>
            {now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, opacity: 0.6, letterSpacing: 3 }}>
            {now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      )}
    </div>
  );
}
