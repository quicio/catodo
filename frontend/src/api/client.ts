const BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

export interface ChannelInfo {
  id: string;
  name: string;
  icon: string;
  type: string;
}

export interface AppState {
  current_channel_id: string | null;
  playing: boolean;
  volume: number;
  available_channels: ChannelInfo[];
  history: string[];
  uptime_seconds: number;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  channels: () => request<ChannelInfo[]>("/api/channels"),
  state: () => request<AppState>("/api/state"),
  open: (id: string) =>
    request<{ ok: boolean; current: string }>(`/api/channels/${id}/open`, {
      method: "POST",
    }),
  next: () =>
    request<{ ok: boolean; current: string }>(`/api/channels/next`, {
      method: "POST",
    }),
  previous: () =>
    request<{ ok: boolean; current: string }>(`/api/channels/previous`, {
      method: "POST",
    }),
  command: (id: string, command: string, extra?: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/channels/${id}/command`, {
      method: "POST",
      body: JSON.stringify({ command, ...extra }),
    }),
  volume: (level: number | "+" | "-") =>
    request<{ ok: boolean; volume: number }>(
      `/api/volume?level=${encodeURIComponent(String(level))}`,
      { method: "POST" }
    ),
};
