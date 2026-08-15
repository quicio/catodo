import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Theme model v2 — seis dimensiones (ver openspec appearance/spec.md)
// ---------------------------------------------------------------------------

export type ShapeId = "square" | "rounded" | "pill";
export type DensityId = "compact" | "comfortable" | "spacious";
export type FontId =
  | "space-grotesk"
  | "jetbrains-mono"
  | "inter"
  | "nunito"
  | "oswald"
  | "orbitron"
  | "vt323"
  | "ibm-plex-mono";
export type IconPackId =
  | "lucide"
  | "game-icons"
  | "feather"
  | "phosphor"
  | "material"
  | "ionicons"
  | "bootstrap"
  | "codicons"
  | "tabler"
  | "radix";

export interface Theme {
  id: string;
  name: string;
  colorScheme: "dark" | "light";
  colors: Record<string, string>;
  typography: { display: FontId; mono: FontId };
  shape: ShapeId;
  density: DensityId;
  effects: { crt: boolean; glow: boolean };
  icons: IconPackId;
}

/** Overrides granulares del usuario; un campo ausente = "seguir al theme". */
export interface ThemeOverrides {
  font?: FontId;
  radius?: ShapeId;
  density?: DensityId;
  iconPack?: IconPackId;
  crt?: boolean;
  glow?: boolean;
}

export const COLOR_KEYS = [
  "bg",
  "surface",
  "text",
  "textDim",
  "textFaint",
  "accent",
  "accentSoft",
  "border",
  "danger",
  "success",
  "chSpotify",
  "chYoutube",
  "chTv",
  "chAnime",
  "chCrunchyroll",
  "chArcade",
] as const;

export const DEFAULT_THEME_ID = "spotify-dark";

// ---------------------------------------------------------------------------
// Registries (valores concretos de cada preset)
// ---------------------------------------------------------------------------

export const FONT_STACKS: Record<FontId, string> = {
  "space-grotesk": '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  "jetbrains-mono": '"JetBrains Mono", ui-monospace, monospace',
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  nunito: '"Nunito", ui-sans-serif, system-ui, sans-serif',
  oswald: '"Oswald", "Arial Narrow", sans-serif',
  orbitron: '"Orbitron", "Space Grotesk", sans-serif',
  vt323: '"VT323", "JetBrains Mono", monospace',
  "ibm-plex-mono": '"IBM Plex Mono", ui-monospace, monospace',
};

export const RADIUS_PRESETS: Record<ShapeId, { sm: string; md: string; lg: string }> = {
  square: { sm: "0px", md: "0px", lg: "2px" },
  rounded: { sm: "6px", md: "10px", lg: "16px" },
  pill: { sm: "999px", md: "999px", lg: "24px" },
};

export const DENSITY_PRESETS: Record<DensityId, { fontSize: string; space: string }> = {
  compact: { fontSize: "14px", space: "0.85" },
  comfortable: { fontSize: "16px", space: "1" },
  spacious: { fontSize: "18px", space: "1.2" },
};

// ---------------------------------------------------------------------------
// Fallback = spotify-dark (sync con backend/catodo/themes.py)
// ---------------------------------------------------------------------------

const FALLBACK: Theme = {
  id: DEFAULT_THEME_ID,
  name: "Spotify Dark",
  colorScheme: "dark",
  colors: {
    bg: "#0a0a0a",
    surface: "#181818",
    text: "#f5f5f5",
    textDim: "rgba(255,255,255,0.6)",
    textFaint: "rgba(255,255,255,0.35)",
    accent: "#1db954",
    accentSoft: "#4dffb1",
    border: "rgba(255,255,255,0.15)",
    danger: "#ff6b6b",
    success: "#1db954",
    chSpotify: "#1db954",
    chYoutube: "#ff0033",
    chTv: "#4d7cff",
    chAnime: "#ffd166",
    chCrunchyroll: "#f47521",
    chArcade: "#b66dff",
  },
  typography: { display: "space-grotesk", mono: "jetbrains-mono" },
  shape: "rounded",
  density: "comfortable",
  effects: { crt: true, glow: false },
  icons: "lucide",
};

const FONT_IDS = Object.keys(FONT_STACKS) as FontId[];
const PACK_IDS: IconPackId[] = [
  "lucide", "game-icons", "feather", "phosphor", "material",
  "ionicons", "bootstrap", "codicons", "tabler", "radix",
];
const SHAPE_IDS = Object.keys(RADIUS_PRESETS) as ShapeId[];
const DENSITY_IDS = Object.keys(DENSITY_PRESETS) as DensityId[];

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function sanitizeTheme(t: unknown): Theme {
  if (!t || typeof t !== "object") return structuredClone(FALLBACK);
  const obj = t as Record<string, unknown>;
  // Alias v1: "tokens" → colors, "crt" raíz → effects.crt
  const rawColors = (obj.colors ?? obj.tokens) as Record<string, unknown> | undefined;
  const colors: Record<string, string> = { ...FALLBACK.colors };
  if (rawColors && typeof rawColors === "object") {
    for (const k of COLOR_KEYS) {
      if (typeof rawColors[k] === "string") colors[k] = rawColors[k] as string;
    }
  }
  const rawTypo = (obj.typography ?? {}) as Record<string, unknown>;
  const rawFx = (obj.effects ?? {}) as Record<string, unknown>;
  return {
    id: String(obj.id || FALLBACK.id),
    name: String(obj.name || FALLBACK.name),
    colorScheme: obj.colorScheme === "light" ? "light" : "dark",
    colors,
    typography: {
      display: pick(rawTypo.display, FONT_IDS, FALLBACK.typography.display),
      mono: pick(rawTypo.mono, FONT_IDS, FALLBACK.typography.mono),
    },
    shape: pick(obj.shape, SHAPE_IDS, FALLBACK.shape),
    density: pick(obj.density, DENSITY_IDS, FALLBACK.density),
    effects: {
      crt: typeof rawFx.crt === "boolean" ? rawFx.crt : obj.crt !== false,
      glow: typeof rawFx.glow === "boolean" ? rawFx.glow : FALLBACK.effects.glow,
    },
    icons: pick(obj.icons, PACK_IDS, FALLBACK.icons),
  };
}

export function sanitizeOverrides(raw: unknown): ThemeOverrides {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: ThemeOverrides = {};
  if (FONT_IDS.includes(o.font as FontId)) out.font = o.font as FontId;
  if (SHAPE_IDS.includes(o.radius as ShapeId)) out.radius = o.radius as ShapeId;
  if (DENSITY_IDS.includes(o.density as DensityId)) out.density = o.density as DensityId;
  if (PACK_IDS.includes(o.iconPack as IconPackId)) out.iconPack = o.iconPack as IconPackId;
  if (typeof o.crt === "boolean") out.crt = o.crt;
  if (typeof o.glow === "boolean") out.glow = o.glow;
  return out;
}

// ---------------------------------------------------------------------------
// Aplicación al DOM
// ---------------------------------------------------------------------------

const toKebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Valores efectivos de un theme + overrides del usuario. */
export function mergeTheme(theme: Theme, overrides: ThemeOverrides) {
  return {
    colors: theme.colors,
    display: overrides.font ?? theme.typography.display,
    mono: theme.typography.mono,
    shape: overrides.radius ?? theme.shape,
    density: overrides.density ?? theme.density,
    crt: overrides.crt ?? theme.effects.crt,
    glow: overrides.glow ?? theme.effects.glow,
    icons: overrides.iconPack ?? theme.icons,
  };
}

export function applyTheme(theme: Theme | null, overrides: ThemeOverrides = {}) {
  const t = theme || structuredClone(FALLBACK);
  const m = mergeTheme(t, overrides);
  const root = document.documentElement;
  root.dataset.theme = t.id;
  root.style.colorScheme = t.colorScheme;
  for (const k of COLOR_KEYS) {
    root.style.setProperty(`--${toKebab(k)}`, m.colors[k] ?? FALLBACK.colors[k]);
  }
  root.style.setProperty("--font-display", FONT_STACKS[m.display]);
  root.style.setProperty("--font-mono", FONT_STACKS[m.mono]);
  const radius = RADIUS_PRESETS[m.shape];
  root.style.setProperty("--radius-sm", radius.sm);
  root.style.setProperty("--radius-md", radius.md);
  root.style.setProperty("--radius-lg", radius.lg);
  const density = DENSITY_PRESETS[m.density];
  root.style.setProperty("--font-size-base", density.fontSize);
  root.style.setProperty("--space-scale", density.space);
  root.style.fontSize = density.fontSize;
  root.dataset.crt = m.crt ? "on" : "off";
  root.dataset.glow = m.glow ? "on" : "off";
  root.dataset.icons = m.icons;
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface ThemeState {
  theme: Theme;
  themes: Theme[];
  overrides: ThemeOverrides;
  crtEnabled: boolean;
  glowEnabled: boolean;
  iconPack: IconPackId;
  setTheme: (id: string) => void;
  setOverride: <K extends keyof ThemeOverrides>(key: K, value: ThemeOverrides[K] | undefined) => void;
  setCrtEnabled: (on: boolean) => void;
}

export const ThemeContext = createContext<ThemeState>({
  theme: structuredClone(FALLBACK),
  themes: [structuredClone(FALLBACK)],
  overrides: {},
  crtEnabled: true,
  glowEnabled: false,
  iconPack: "lucide",
  setTheme: () => {},
  setOverride: () => {},
  setCrtEnabled: () => {},
});

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

export function resolveTheme(cfg: {
  theme?: string;
  themes?: unknown;
  theme_crt_enabled?: boolean;
  theme_overrides?: unknown;
}): ThemeState {
  const themes = Array.isArray(cfg.themes) ? cfg.themes : [];
  const list = themes.map(sanitizeTheme);
  const active = list.find((t) => t.id === cfg.theme) || sanitizeTheme(null);
  const overrides = sanitizeOverrides(cfg.theme_overrides);
  const m = mergeTheme(active, overrides);
  return {
    theme: active,
    themes: list,
    overrides,
    crtEnabled: m.crt,
    glowEnabled: m.glow,
    iconPack: m.icons,
    setTheme: () => {},
    setOverride: () => {},
    setCrtEnabled: () => {},
  };
}
