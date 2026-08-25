import { useEffect, useRef, useState } from "react";

interface WebChannelState {
  url: string;
  partition?: string;
  user_agent?: string;
  search_url?: string;
}

const UA_ALIASES: Record<string, string> = {
  "android-tv":
    "Mozilla/5.0 (Linux; U; Android 10; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
  chrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export default function WebChannel({ channelId, active = true }: { channelId: string; active?: boolean }) {
  const [st, setSt] = useState<WebChannelState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const webviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/channels/${channelId}/state`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: WebChannelState | null) => setSt(s))
      .catch(() => setSt(null));
  }, [channelId]);

  // Live state updates: el webview necesita recargar si la URL cambió
  // (ej. search command desde el remote navega a youtube.com/results).
  useEffect(() => {
    const onState = (e: Event) => {
      const ce = e as CustomEvent;
      const detail = ce.detail as { id?: string; state?: WebChannelState } | undefined;
      if (!detail || detail.id !== channelId || !detail.state) return;
      setSt(detail.state);
    };
    window.addEventListener("catodo:channel_state", onState);
    return () => window.removeEventListener("catodo:channel_state", onState);
  }, [channelId]);

  useEffect(() => {
    if (!st || !st.url || !webviewRef.current) return;
    const wv = webviewRef.current as unknown as {
      addEventListener: (ev: string, cb: () => void) => void;
      removeEventListener: (ev: string, cb: () => void) => void;
      setZoomFactor: (z: number) => void;
    };
    const onReady = () => {
      setLoaded(true);
      try {
        const w = window.innerWidth;
        if (w > 1920) wv.setZoomFactor(1920 / w);
      } catch {}
    };
    wv.addEventListener("dom-ready", onReady);
    return () => wv.removeEventListener("dom-ready", onReady);
  }, [st?.url]);

  // Keep-alive: el webview queda montado oculto al cambiar de canal. Cuando el
  // canal pasa a segundo plano, pausamos los medios para que el video quede
  // exactamente donde estaba (sin audio mezclado) al volver.
  useEffect(() => {
    if (active) return;
    const wv = webviewRef.current as unknown as {
      executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
    } | null;
    if (!wv) return;
    try {
      wv
        .executeJavaScript(`(() => {
          for (const el of document.querySelectorAll('video, audio')) el.pause();
        })()`, false)
        .catch(() => {});
    } catch {}
  }, [active]);

  if (!st || !st.url) {
    return (
      <div style={{ position: "absolute", inset: 0, background: "#000", display: "grid", placeItems: "center", color: "var(--text)", opacity: 0.6 }}>
        Cargando…
      </div>
    );
  }

  const ua = (st.user_agent && UA_ALIASES[st.user_agent]) || undefined;
  const partition = st.partition || `persist:${channelId}`;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--text)", opacity: 0.6, zIndex: 1, pointerEvents: "none" }}>
          Cargando…
        </div>
      )}
      <webview
        ref={webviewRef}
        src={st.url}
        partition={partition}
        allowpopups="true"
        {...(ua ? { useragent: ua } : {})}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
