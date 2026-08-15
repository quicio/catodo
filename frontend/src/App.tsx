import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, type AppState, type ChannelInfo } from "./api/client";
import { useWebSocket, applyEvent, createInitialState } from "./api/ws";
import ChannelView from "./components/ChannelView";
import ChannelBar from "./components/ChannelBar";
import Home from "./components/Home";
import CrtShell from "./components/CrtShell";
import IdleScreensaver from "./components/IdleScreensaver";
import { CastProvider } from "./cast/CastContext";
import {
  ThemeContext,
  applyTheme,
  mergeTheme,
  resolveTheme,
  sanitizeOverrides,
  sanitizeTheme,
  type ThemeOverrides,
  type ThemeState,
} from "./theme";

const HOTKEYS = ["1", "2", "3", "4", "5", "6"];

export default function App() {
  const [state, dispatch] = useReducer(applyEvent, [] as ChannelInfo[], createInitialState);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [barVisible, setBarVisible] = useState(true);
  const [idleState, setIdleState] = useState<"active" | "screensaver" | "sleep">("active");
  const [voiceFeedback, setVoiceFeedback] = useState<{ text: string; recognized: boolean } | null>(null);
  const [themeState, setThemeState] = useState<ThemeState | null>(null);

  const themeRef = useRef(themeState);
  themeRef.current = themeState;

  const stateRef = useRef<AppState>(state);
  const channelsRef = useRef<ChannelInfo[]>([]);
  const idleRef = useRef(idleState);
  const resumeDoneRef = useRef(false);
  stateRef.current = state;
  channelsRef.current = channels;
  idleRef.current = idleState;

  const handleEvent = useCallback(
    (event: { event: string; [k: string]: unknown }) => {
      // Teclas multimedia del remote → inyectar en el webview activo. El manifest
      // del canal puede re-mapear la acción a una tecla que entienda su player
      // (ej. Movistar usa Space para play/pause).
      if (event.event === "media_key") {
        const k = String(event.key ?? "");
        const cur = stateRef.current.available_channels?.find(
          (c) => c.id === stateRef.current.current_channel_id,
        );
        const mediaKeys = (cur as { media_keys?: Record<string, string> } | undefined)?.media_keys;
        const final = (mediaKeys && mediaKeys[k]) || k;
        const catodo = (window as unknown as { catodo?: { mediaKey?: (key: string) => void } }).catodo;
        try {
          catodo?.mediaKey?.(final);
        } catch {}
      }
      // Teclado del remote → inyectar texto en el webview activo.
      if (event.event === "type_text") {
        const catodo = (window as unknown as { catodo?: { insertText?: (t: string) => void } }).catodo;
        try {
          catodo?.insertText?.(String(event.text ?? ""));
        } catch {}
      }
      // Estados de reposo del backend
      if (event.event === "idle_screensaver_on") setIdleState("screensaver");
      else if (event.event === "idle_sleep_on") setIdleState("sleep");
      else if (event.event === "idle_off") setIdleState("active");
      // Cambio de theme/config → re-aplicar tokens sin recargar
      if (event.event === "config_changed" && themeRef.current) {
        const key = String(event.key ?? "");
        if (["theme", "themes", "theme_crt_enabled", "theme_overrides"].includes(key)) {
          const next = { ...themeRef.current };
          if (key === "theme") {
            next.theme =
              next.themes.find((t) => t.id === event.value) || next.theme;
          }
          if (key === "theme_crt_enabled") {
            next.overrides = { ...next.overrides, crt: event.value !== false };
          }
          if (key === "theme_overrides") {
            next.overrides = sanitizeOverrides(event.value);
          }
          if (key === "themes") {
            next.themes = (Array.isArray(event.value) ? event.value : []).map(
              (t) => sanitizeTheme(t),
            );
            next.theme =
              next.themes.find((t) => t.id === next.theme.id) || next.themes[0];
          }
          const m = mergeTheme(next.theme, next.overrides);
          next.crtEnabled = m.crt;
          next.glowEnabled = m.glow;
          next.iconPack = m.icons;
          setThemeState(next);
          applyTheme(next.theme, next.overrides);
        }
      }
      // Comando por voz → feedback breve + "home" lo maneja el frontend.
      if (event.event === "voice_command") {
        setVoiceFeedback({ text: String(event.text ?? ""), recognized: Boolean(event.recognized) });
        if (event.action === "home") dispatch({ event: "channel_changed", channel_id: null });
      }
      // Snapshot (WS reconectado): refrescar la lista de canales para que
      // canales nuevos (Arcade, bibliotecas, plugins) aparezcan sin recargar.
      if (event.event === "state_snapshot") {        const list = event.available_channels as ChannelInfo[] | undefined;
        if (Array.isArray(list) && list.length > 0) {
          setChannels(list);
          dispatch({ event: "_channels_loaded", channels: list });
        }
        // Resume de sesión: al arrancar, abrir el último canal activo (una vez).
        if (!resumeDoneRef.current) {
          resumeDoneRef.current = true;
          const lastId = event.last_channel_id as string | undefined;
          if (lastId && Array.isArray(list) && list.some((c) => c.id === lastId)) {
            fetch("/api/config")
              .then((r) => (r.ok ? r.json() : null))
              .then((cfg) => {
                if (cfg && cfg.resume_last_channel !== false) {
                  api.open(lastId).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      }
      // Proyección: al iniciar, abrir el canal; al terminar, volver al Home
      if (event.event === "cast_session_started") {
        api.open("screen-cast").catch(() => {});
      } else if (event.event === "cast_session_ended" && stateRef.current.current_channel_id === "screen-cast") {
        dispatch({ event: "channel_changed", channel_id: null });
      }
      dispatch(event);
    },
    [],
  );

  useWebSocket(handleEvent);

  // Ocultar el feedback de voz a los ~3s.
  useEffect(() => {
    if (!voiceFeedback) return;
    const id = window.setTimeout(() => setVoiceFeedback(null), 3000);
    return () => clearTimeout(id);
  }, [voiceFeedback]);

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
  };

  const goHome = () => {
    dispatch({ event: "channel_changed", channel_id: null });
  };

  useEffect(() => {
    (window as unknown as { __catodoSwitch?: (id: string) => void }).__catodoSwitch = switchChannel;
  }, []);

  // Actividad local del kiosk: cierra el screensaver al instante y avisa al
  // backend (throttled) para que no vuelva a entrar en reposo. La reproducción
  // en curso también cuenta como actividad (video local + Spotify).
  useEffect(() => {
    const lastPingRef = { t: 0 };
    const ping = () => {
      const now = Date.now();
      if (now - lastPingRef.t > 3000) {
        lastPingRef.t = now;
        api.activity().catch(() => {});
      }
    };
    const wake = () => {
      if (idleRef.current !== "active") setIdleState("active");
      ping();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, wake));
    const pollPlaying = () => {
      const video = document.querySelector("video");
      const videoPlaying = !!(
        video && !video.paused && !video.ended && video.readyState >= 2
      );
      const spotifyPlaying = stateRef.current.spotify?.status === "Playing";
      if (videoPlaying || spotifyPlaying || stateRef.current.playing) wake();
    };
    const interval = window.setInterval(pollPlaying, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ch = (await api.channels()) as ChannelInfo[];
        if (!alive) return;
        setChannels(ch);
        dispatch({ event: "_channels_loaded", channels: ch });
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Cargar la config inicial (theme incluido) y aplicarla al boot.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await api.config();
        if (!alive) return;
        const next = resolveTheme(cfg);
        setThemeState(next);
        applyTheme(next.theme, next.overrides);
      } catch {
        if (!alive) return;
        const next = resolveTheme({});
        setThemeState(next);
        applyTheme(next.theme, next.overrides);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ch = channelsRef.current;
      if (HOTKEYS.includes(e.key)) {
        const idx = Number(e.key) - 1;
        const target = ch[idx];
        if (target) {
          e.preventDefault();
          api.open(target.id).catch(console.warn);
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

  const current =
    channels.find((c) => c.id === state.current_channel_id) ?? null;
  const channelNumber = current
    ? channels.findIndex((c) => c.id === current.id) + 1
    : 0;

  if (channels.length === 0) {
    return (
      <div className="channel-view placeholder">
        <h1>Cátodo</h1>
        <p>Connecting…</p>
      </div>
    );
  }

  // Optimista: aplica localmente y persiste; el evento config_changed reconcilia.
  const applyOptimistic = (next: ThemeState) => {
    setThemeState(next);
    applyTheme(next.theme, next.overrides);
  };

  const themeCtx: ThemeState = themeState
    ? {
        ...themeState,
        setTheme: (id: string) => {
          const next = themeRef.current;
          if (next) {
            const t = next.themes.find((x) => x.id === id);
            if (t) {
              const m = mergeTheme(t, next.overrides);
              applyOptimistic({ ...next, theme: t, crtEnabled: m.crt, glowEnabled: m.glow, iconPack: m.icons });
            }
          }
          api.setConfig({ theme: id }).catch(console.warn);
        },
        setOverride: (key, value) => {
          const next = themeRef.current;
          if (next) {
            const overrides: ThemeOverrides = { ...next.overrides };
            if (value === undefined) delete overrides[key];
            else overrides[key] = value;
            const m = mergeTheme(next.theme, overrides);
            applyOptimistic({ ...next, overrides, crtEnabled: m.crt, glowEnabled: m.glow, iconPack: m.icons });
            api.setConfig({ theme_overrides: overrides }).catch(console.warn);
          }
        },
        setCrtEnabled: (on: boolean) => {
          const next = themeRef.current;
          if (next) {
            const overrides: ThemeOverrides = { ...next.overrides, crt: on };
            const m = mergeTheme(next.theme, overrides);
            applyOptimistic({ ...next, overrides, crtEnabled: m.crt, glowEnabled: m.glow, iconPack: m.icons });
            api.setConfig({ theme_overrides: overrides }).catch(console.warn);
          }
        },
      }
    : {
        theme: sanitizeTheme(null),
        themes: [],
        overrides: {},
        crtEnabled: true,
        glowEnabled: false,
        iconPack: "lucide",
        setTheme: () => {},
        setOverride: () => {},
        setCrtEnabled: () => {},
      };

  return (
    <CastProvider>
    <ThemeContext.Provider value={themeCtx}>
    <CrtShell
      channelId={state.current_channel_id}
      channelNumber={channelNumber}
      volume={state.volume}
    >
      {current ? (
        <ChannelView current={current} volume={state.volume} state={state} />
      ) : (
        <Home channels={channels} onPick={switchChannel} state={state} />
      )}
      <ChannelBar
        channels={channels}
        current={state.current_channel_id}
        visible={barVisible}
        onPick={switchChannel}
      />
    </CrtShell>
    <IdleScreensaver state={idleState} />
    {voiceFeedback && (
      <div
        style={{
          position: "fixed",
          top: 28,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          padding: "10px 18px",
          borderRadius: 999,
          background: voiceFeedback.recognized
            ? "color-mix(in srgb, var(--accent) 90%, transparent)"
            : "color-mix(in srgb, var(--danger) 90%, transparent)",
          color: "var(--bg)",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 1,
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        🎤 {voiceFeedback.recognized ? voiceFeedback.text : `No entendí: "${voiceFeedback.text}"`}
      </div>
    )}
    </ThemeContext.Provider>
    </CastProvider>
  );
}
