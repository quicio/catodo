import { useEffect, useRef } from "react";
import type { AppState, ChannelInfo } from "./client";

export type EventHandler = (event: { event: string; [k: string]: unknown }) => void;

const WS_URL =
  (typeof window !== "undefined" && window.location.protocol === "https:"
    ? "wss:"
    : "ws:") +
  "//" +
  (typeof window !== "undefined" ? window.location.host : "127.0.0.1:1420") +
  "/api/ws";

export function useWebSocket(onEvent: EventHandler): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: number | null = null;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          handlerRef.current(parsed);
        } catch (e) {
          console.warn("bad ws message", msg.data, e);
        }
      };
      ws.onclose = () => {
        if (!stopped) retry = window.setTimeout(connect, 1000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retry !== null) clearTimeout(retry);
      ws?.close();
    };
  }, []);
}

export function createInitialState(channels: ChannelInfo[]): AppState {
  return {
    current_channel_id: null,
    playing: false,
    volume: 50,
    available_channels: channels,
    history: [],
    uptime_seconds: 0,
  };
}

export function applyEvent(state: AppState, event: { event: string; [k: string]: unknown }): AppState {
  switch (event.event) {
    case "state_snapshot": {
      // El snapshot trae el estado por canal (channels.spotify); sin esto, si
      // Spotify ya está reproduciendo y no cambia nada, la vista queda en
      // "Conectando a Spotify…" hasta que ocurra un track_changed.
      const spot = (event.channels as { spotify?: Record<string, unknown> } | undefined)?.spotify;
      const spotify = spot
        ? {
            title: String(spot.title ?? ""),
            artist: String(spot.artist ?? ""),
            album: String(spot.album ?? ""),
            art_url: String(spot.art_url ?? ""),
            status: String(spot.status ?? "Stopped"),
            position: Number(spot.position ?? 0),
          }
        : state.spotify;
      const arc = (event.channels as { arcade?: Record<string, unknown> } | undefined)?.arcade;
      const arcade = arc
        ? {
            playing: Boolean(arc.playing),
            game: (arc.current as unknown) ?? null,
            error: state.arcade?.error,
          }
        : state.arcade;
      return {
        ...state,
        current_channel_id: (event.current_channel_id as string) ?? null,
        playing: (event.playing as boolean) ?? false,
        volume: (event.volume as number) ?? 50,
        available_channels: (event.available_channels as AppState["available_channels"]) ?? [],
        history: (event.history as string[]) ?? [],
        uptime_seconds: (event.uptime_seconds as number) ?? 0,
        spotify,
        arcade,
      };
    }
    case "channel_changed":
      return { ...state, current_channel_id: String(event.channel_id ?? null) };
    case "channel_closed":
      if (state.current_channel_id === event.channel_id) {
        return { ...state, current_channel_id: null };
      }
      return state;
    case "volume_changed":
      return { ...state, volume: Number(event.volume ?? state.volume) };
    case "playing_changed":
      return { ...state, playing: Boolean(event.playing ?? false) };
    case "game_launched":
      return { ...state, arcade: { playing: true, game: event.game ?? null, error: undefined } };
    case "game_exited":
      return { ...state, arcade: { playing: false, game: null, error: undefined } };
    case "game_launch_failed":
      return {
        ...state,
        arcade: {
          playing: state.arcade?.playing ?? false,
          game: state.arcade?.game ?? null,
          error: String(event.error ?? "no se pudo lanzar el juego"),
        },
      };
    case "boxart_fetched":
    case "boxarts_synced":
      // Nueva carátula descargada → la grilla del Arcade se refresca.
      return {
        ...state,
        arcade: {
          playing: state.arcade?.playing ?? false,
          game: state.arcade?.game ?? null,
          error: undefined,
          boxart_revision: (state.arcade?.boxart_revision ?? 0) + 1,
        },
      };
    case "boxart_failed":
      return {
        ...state,
        arcade: {
          playing: state.arcade?.playing ?? false,
          game: state.arcade?.game ?? null,
          error: String(event.error ?? "no se pudo descargar la carátula"),
        },
      };
    case "track_changed":
      return {
        ...state,
        spotify: {
          title: String(event.title ?? ""),
          artist: String(event.artist ?? ""),
          album: String(event.album ?? ""),
          art_url: String(event.art_url ?? ""),
          status: String(event.status ?? "Stopped"),
          position: Number(event.position ?? 0),
        },
      };
    case "playback_status_changed":
      return {
        ...state,
        spotify: {
          ...state.spotify,
          title: state.spotify?.title ?? "",
          artist: state.spotify?.artist ?? "",
          album: state.spotify?.album ?? "",
          art_url: state.spotify?.art_url ?? "",
          status: String(event.status ?? state.spotify?.status ?? ""),
          position: Number(event.position ?? state.spotify?.position ?? 0),
        },
      };
    case "playback_progress":
      if (!state.spotify) return state;
      return {
        ...state,
        spotify: {
          ...state.spotify,
          position: Number(event.position ?? state.spotify.position ?? 0),
        },
      };
    default:
      return state;
  }
}
