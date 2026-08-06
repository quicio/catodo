import { useEffect, useRef, useState } from "react";
import { api, type AppState, type ChannelInfo } from "./api/client";
import ChannelView from "./components/ChannelView";
import ChannelBar from "./components/ChannelBar";
import Home from "./components/Home";
import CrtShell from "./components/CrtShell";

const HOTKEYS = ["1", "2", "3", "4", "5", "6"];

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [barVisible, setBarVisible] = useState(true);

  const stateRef = useRef<AppState | null>(null);
  const channelsRef = useRef<ChannelInfo[]>([]);
  stateRef.current = state;
  channelsRef.current = channels;

  useEffect(() => {
    let timer: number | null = null;
    const HIDE_AFTER_MS = 8000;
    const wake = () => {
      setBarVisible(true);
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => setBarVisible(false), HIDE_AFTER_MS);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);

  const switchChannel = (id: string) => {
    api.open(id).catch(console.warn);
    setState((prev) => (prev ? { ...prev, current_channel_id: id } : prev));
  };

  const goHome = () => {
    const cur = stateRef.current?.current_channel_id;
    if (cur) {
      fetch(`/api/channels/${cur}/close`, { method: "POST" }).catch(() => {});
    }
    setState((prev) => (prev ? { ...prev, current_channel_id: null } : prev));
  };

  // Exponer switch de canal para la barra overlay (Ctrl+B sobre webviews)
  useEffect(() => {
    (window as unknown as { __catodoSwitch?: (id: string) => void }).__catodoSwitch = switchChannel;
  }, []);

  useEffect(() => {
    // Probe del renderer WebGL (diagnóstico de GPU/posterizado)
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") as WebGLRenderingContext | null;
      if (gl) {
        console.log("[catodo] WebGL renderer:", gl.getParameter(gl.RENDERER), "| vendor:", gl.getParameter(gl.VENDOR));
      } else {
        console.log("[catodo] no webgl");
      }
    } catch (e) {
      console.log("[catodo] gl probe err", e);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const chRes = await fetch("/api/channels");
        if (!chRes.ok) throw new Error(`channels: HTTP ${chRes.status}`);
        const ch = (await chRes.json()) as ChannelInfo[];
        const stRes = await fetch("/api/state");
        if (!stRes.ok) throw new Error(`state: HTTP ${stRes.status}`);
        const st = (await stRes.json()) as AppState;
        if (!alive) return;
        setChannels(ch);
        // Arrancar siempre en el Home (cerrar el canal previo si lo hubiera)
        if (st.current_channel_id) {
          fetch(`/api/channels/${st.current_channel_id}/close`, { method: "POST" }).catch(() => {});
          setState({ ...st, current_channel_id: null });
        } else {
          setState(st);
        }
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ch = channelsRef.current;
      const st = stateRef.current;
      if (HOTKEYS.includes(e.key)) {
        const idx = Number(e.key) - 1;
        const target = ch[idx];
        if (target) {
          e.preventDefault();
          api.open(target.id).catch(console.warn);
          if (st) setState({ ...st, current_channel_id: target.id });
        }
      } else if (e.key === "F11") {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      } else if (e.key === "Escape") {
        if (document.fullscreenElement) document.exitFullscreen();
        goHome();
      } else if (e.key === "+" || e.key === "=") {
        api.volume("+").catch(console.warn);
      } else if (e.key === "-" || e.key === "_") {
        api.volume("-").catch(console.warn);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        api.volume("+").catch(console.warn);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        api.volume("-").catch(console.warn);
      }
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/state");
        if (!r.ok) return;
        const st = (await r.json()) as AppState;
        setState((prev) =>
          prev && prev.volume === st.volume ? prev : { ...prev!, volume: st.volume },
        );
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!state) {
    return (
      <div className="channel-view placeholder">
        <h1>Cátodo</h1>
        <p>{error ? `Error: ${error}` : "Connecting…"}</p>
      </div>
    );
  }

  const current =
    channels.find((c) => c.id === state.current_channel_id) ?? null;
  const channelNumber = current
    ? channels.findIndex((c) => c.id === current.id) + 1
    : 0;

  return (
    <CrtShell
      channelId={state.current_channel_id}
      channelNumber={channelNumber}
      volume={state.volume}
    >
      {current ? (
        <ChannelView current={current} />
      ) : (
        <Home channels={channels} onPick={switchChannel} />
      )}
      <ChannelBar
        channels={channels}
        current={state.current_channel_id}
        visible={barVisible}
        onPick={switchChannel}
      />
    </CrtShell>
  );
}
