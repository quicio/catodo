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
  color?: string;
  order?: number;
}

export interface AppState {
  current_channel_id: string | null;
  playing: boolean;
  volume: number;
  available_channels: ChannelInfo[];
  history: string[];
  uptime_seconds: number;
  spotify?: {
    title?: string;
    artist?: string;
    album?: string;
    art_url?: string;
    status?: string;
    position?: number;
  };
  arcade?: {
    playing: boolean;
    game?: unknown;
    error?: string;
    boxart_revision?: number;
  };
}

export interface RuntimeConfig {
  [key: string]: unknown;
  theme?: string;
  themes?: ThemeInfo[];
  theme_crt_enabled?: boolean;
  theme_overrides?: ThemeOverridesInput;
  home_layout_id?: string;
}

export interface ThemeOverridesInput {
  font?: string;
  radius?: string;
  density?: string;
  iconPack?: string;
  crt?: boolean;
  glow?: boolean;
}

export interface ThemeInfo {
  id: string;
  name: string;
  colorScheme: "dark" | "light";
  colors: Record<string, string>;
  typography: { display: string; mono: string };
  shape: string;
  density: string;
  effects: { crt: boolean; glow: boolean };
  icons: string;
}

export interface ModePreset {
  id: string;
  name: string;
  payload: Record<string, unknown>;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  channels: () => request<ChannelInfo[]>("/api/channels"),
  state: () => request<AppState>("/api/state"),
  config: () => request<RuntimeConfig>("/api/config"),
  setConfig: (patch: Record<string, unknown>) =>
    request<RuntimeConfig>("/api/config", {
      method: "POST",
      body: JSON.stringify(patch),
    }),
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
  activity: () => request<{ ok: boolean }>("/api/activity", { method: "POST" }),
  // --- Mode presets ---
  modes: () => request<{ presets: ModePreset[] }>("/api/modes"),
  createMode: (name: string, payload: Record<string, unknown>) =>
    request<ModePreset>("/api/modes", {
      method: "POST",
      body: JSON.stringify({ name, payload }),
    }),
  updateMode: (
    id: string,
    patch: { name?: string; payload?: Record<string, unknown> }
  ) =>
    request<ModePreset>(`/api/modes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteMode: (id: string) =>
    request<{ deleted: string }>(`/api/modes/${id}`, { method: "DELETE" }),
  applyMode: (id: string) =>
    request<{ ok: boolean; preset_id: string; config: RuntimeConfig }>(
      `/api/modes/${id}/apply`,
      { method: "POST" }
    ),
};
