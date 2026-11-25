const BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // Sin body JSON: conservar el status.
    }
    throw new Error(detail);
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
  search_url?: string;
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
  channelIcons?: string;
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
  channelIcons?: string;
}

export interface ModePreset {
  id: string;
  name: string;
  payload: Record<string, unknown>;
}

export interface PairDevice {
  id: string;
  name: string;
  created?: number;
  expires?: number | null;
}

export interface LibraryInfo {
  id: string;
  name: string;
  path: string;
  kind: "series" | "movies" | "collections";
  icon?: string;
  color?: string | null;
  order?: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  type: string;
  bundled: boolean;
  installed: boolean;
  enabled: boolean;
  origin: string;
  valid?: boolean;
  drm?: boolean;
  url?: string;
  user_agent?: string;
  partition?: string;
  order?: number | null;
  config_key?: string;
  available_version?: string;
  installed_version?: string;
}

export interface IptvEntry {
  id: string;
  name: string;
  logo?: string;
  available?: boolean;
  error?: string | null;
}

export interface IptvGroup {
  name: string;
  channels: IptvEntry[];
}

export interface IptvHealth {
  checking: boolean;
  checked: number;
  total: number;
  available: number;
  unavailable: number;
  checked_at?: number | null;
}

export interface IptvState {
  id: string;
  configured: boolean;
  groups: IptvGroup[];
  current: IptvEntry | null;
  count: number;
  error?: string | null;
  health?: IptvHealth;
}

export interface IptvPlaylistResult {
  ok: boolean;
  source: string;
  count: number;
  groups: number;
  bytes: number;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  version: () => request<{ version: string }>("/api/version"),
  devices: () => request<{ devices: PairDevice[] }>("/api/pair/devices"),
  revokeDevice: (id: string) =>
    request<{ ok: boolean }>(`/api/pair/devices/${id}`, { method: "DELETE" }),
  channels: () => request<ChannelInfo[]>("/api/channels"),
  libraries: () => request<LibraryInfo[]>("/api/libraries"),
  addLibrary: (body: {
    name: string;
    path: string;
    kind: "series" | "movies" | "collections";
    icon?: string;
    color?: string | null;
    order?: number;
  }) =>
    request<{ ok: boolean; id: string }>("/api/libraries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateLibrary: (
    id: string,
    body: Partial<{
      name: string;
      path: string;
      kind: "series" | "movies" | "collections";
      icon: string;
      color: string | null;
      order: number;
    }>
  ) =>
    request<{ ok: boolean; id: string }>(`/api/libraries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeLibrary: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/libraries/${id}`, {
      method: "DELETE",
    }),
  plugins: () => request<PluginInfo[]>("/api/plugins"),
  catalog: () => request<PluginInfo[]>("/api/plugins/catalog"),
  installPlugin: (id: string) =>
    request<PluginInfo>("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  uninstallPlugin: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/plugins/${id}`, { method: "DELETE" }),
  setPluginEnabled: (id: string, enabled: boolean) =>
    request<{ ok: boolean; id: string }>(
      `/api/plugins/${id}/${enabled ? "enable" : "disable"}`,
      { method: "POST" }
    ),
  setPluginOrder: (id: string, order: number | null) =>
    request<{ ok: boolean; id: string; order: number | null }>(
      `/api/plugins/${id}/order`,
      { method: "POST", body: JSON.stringify({ order }) }
    ),
  state: () => request<AppState>("/api/state"),
  config: () => request<RuntimeConfig>("/api/config"),
  setConfig: (patch: Record<string, unknown>) =>
    request<RuntimeConfig>("/api/config", {
      method: "POST",
      body: JSON.stringify(patch),
    }),
  iptvState: () => request<IptvState>("/api/channels/iptv/state"),
  uploadIptvPlaylist: (content: string) =>
    request<IptvPlaylistResult>("/api/iptv/playlist", {
      method: "POST",
      headers: { "Content-Type": "audio/x-mpegurl" },
      body: content,
    }),
  clearIptvPlaylist: () =>
    request<{ ok: boolean }>("/api/iptv/playlist", { method: "DELETE" }),
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
