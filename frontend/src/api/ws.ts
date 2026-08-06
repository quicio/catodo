import { useEffect, useRef } from "react";
import type { AppState } from "./client";

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

export function applyEvent(state: AppState, event: { event: string; [k: string]: unknown }): AppState {
  switch (event.event) {
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
    default:
      return state;
  }
}
