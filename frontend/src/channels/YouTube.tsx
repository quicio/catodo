import { useEffect, useRef, useState } from "react";

interface YouTubeState {
  url: string;
}

const DEFAULT_URL = "https://www.youtube.com/tv";
const TV_UA =
  "Mozilla/5.0 (Linux; U; Android 10; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36";

export default function YouTube() {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const webviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/channels/youtube/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: YouTubeState | null) => setUrl(s?.url || DEFAULT_URL))
      .catch(() => setUrl(DEFAULT_URL));
  }, []);

  useEffect(() => {
    if (!url || !webviewRef.current) return;
    const wv = webviewRef.current as unknown as {
      addEventListener: (ev: string, cb: () => void) => void;
      removeEventListener: (ev: string, cb: () => void) => void;
      setZoomFactor: (z: number) => void;
    };
    const onReady = () => {
      setLoaded(true);
      // La UI TV de YouTube está diseñada para ~1920px. Si la ventana es más
      // ancha, aplicar zoom para que las miniaturas no queden upscaladas.
      try {
        const w = window.innerWidth;
        if (w > 1920) {
          wv.setZoomFactor(1920 / w);
        }
      } catch (e) {
        console.warn("[youtube] zoom err", e);
      }
    };
    wv.addEventListener("dom-ready", onReady);
    return () => wv.removeEventListener("dom-ready", onReady);
  }, [url]);

  if (!url) {
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
        }}
      >
        Cargando YouTube…
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            opacity: 0.6,
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          Cargando…
        </div>
      )}
      <webview
        ref={webviewRef}
        src={url || ""}
        useragent={TV_UA}
        partition="persist:youtube"
        allowpopups="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
