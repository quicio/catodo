import { useEffect, useRef, useState } from "react";
import { useCast } from "../cast/CastContext";

interface CastInfo {
  state?: string;
  source?: string;
}

export default function ScreenCastView() {
  const { stream, status } = useCast();
  const [info, setInfo] = useState<CastInfo | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetch("/api/cast")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [stream]);

  if (status === "active" && stream) {
    return (
      <div style={{ position: "absolute", inset: 0, background: "#000" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
        />
        {info?.source && (
          <div
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 2,
              opacity: 0.5,
              color: "#fff",
            }}
          >
            PROYECTANDO · {info.source}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        opacity: 0.6,
        fontSize: 18,
      }}
    >
      {status === "failed"
        ? "Fallo en la proyección"
        : status === "connecting" || info?.state === "signaling"
        ? "Conectando proyección…"
        : "Esperando proyección…\nAbrí /cast en el dispositivo"}
    </div>
  );
}
