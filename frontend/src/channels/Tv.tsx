import { useEffect, useRef, useState } from "react";

interface TvState {
  url: string;
}

const DEFAULT_URL = "https://www.movistartv.cl";

export default function Tv() {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const webviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/channels/tv/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: TvState | null) => setUrl(s?.url || DEFAULT_URL))
      .catch(() => setUrl(DEFAULT_URL));
  }, []);

  useEffect(() => {
    if (!url || !webviewRef.current) return;
    const wv = webviewRef.current as unknown as {
      addEventListener: (ev: string, cb: () => void) => void;
      removeEventListener: (ev: string, cb: () => void) => void;
    };
    const onReady = () => setLoaded(true);
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
        Cargando TV…
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
        partition="persist:tv"
        allowpopups="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
