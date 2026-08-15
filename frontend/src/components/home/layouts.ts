import type { HomeLayout } from "./types";

/**
 * Layout default — replica la composición actual del Home (8 slots).
 *
 *   Home
 *   ├── wallpaper-background      (root)
 *   ├── clock                    (root)
 *   ├── mini-now-playing         (root, condicional a Spotify)
 *   ├── brand                    (root)
 *   ├── channel-grid             (root)
 *   ├── ratings-column           (root, fixed right)
 *   ├── appearance-settings-popover (overlay)
 *   └── pair-modal               (overlay)
 */
export const DEFAULT_LAYOUT: HomeLayout = {
  layoutId: "default",
  components: [
    { id: "wallpaper-background" },
    { id: "clock" },
    { id: "mini-now-playing" },
    { id: "brand" },
    { id: "channel-grid" },
    { id: "ratings-column" },
    { id: "appearance-settings-popover", position: "overlay" },
    { id: "pair-modal", position: "overlay" },
  ],
};

/**
 * minimal-layout — lo más limpio: fondo + reloj + grilla. Sin ruido.
 */
export const MINIMAL_LAYOUT: HomeLayout = {
  layoutId: "minimal-layout",
  components: [
    { id: "wallpaper-background" },
    { id: "clock" },
    { id: "channel-grid" },
  ],
};

/**
 * cinema-layout — pensado para sesión de película: sin ratings ni popover
 * (no se interactúa con la grilla), solo fondo + reloj + grilla + ahora suena.
 */
export const CINEMA_LAYOUT: HomeLayout = {
  layoutId: "cinema-layout",
  components: [
    { id: "wallpaper-background" },
    { id: "clock" },
    { id: "mini-now-playing" },
    { id: "channel-grid" },
  ],
};

/**
 * focus-layout — sin brand (no necesitás ver "Cátodo") ni mini-now-playing,
 * pero sí ratings y popover para configurar.
 */
export const FOCUS_LAYOUT: HomeLayout = {
  layoutId: "focus-layout",
  components: [
    { id: "wallpaper-background" },
    { id: "clock" },
    { id: "channel-grid" },
    { id: "ratings-column" },
    { id: "appearance-settings-popover", position: "overlay" },
  ],
};

/**
 * clean-layout — el "default" sin ratings ni popover ni pair-modal.
 * Modo kiosk desatendido: solo fondo + reloj + brand + grilla.
 */
export const CLEAN_LAYOUT: HomeLayout = {
  layoutId: "clean-layout",
  components: [
    { id: "wallpaper-background" },
    { id: "clock" },
    { id: "brand" },
    { id: "channel-grid" },
  ],
};

/**
 * wallpaper-only-layout — "modo arte": fondo + reloj + título. Sin grilla
 * (no se elige canal).
 */
export const WALLPAPER_ONLY_LAYOUT: HomeLayout = {
  layoutId: "wallpaper-only-layout",
  components: [
    { id: "wallpaper-background" },
    { id: "clock" },
    { id: "brand" },
  ],
};

export const LAYOUTS: Record<string, HomeLayout> = {
  default: DEFAULT_LAYOUT,
  "minimal-layout": MINIMAL_LAYOUT,
  "cinema-layout": CINEMA_LAYOUT,
  "focus-layout": FOCUS_LAYOUT,
  "clean-layout": CLEAN_LAYOUT,
  "wallpaper-only-layout": WALLPAPER_ONLY_LAYOUT,
};

/**
 * Labels legibles para el selector del panel de settings.
 */
export const LAYOUT_LABELS: Record<string, string> = {
  default: "Default",
  "minimal-layout": "Minimal",
  "cinema-layout": "Cinema",
  "focus-layout": "Focus",
  "clean-layout": "Clean",
  "wallpaper-only-layout": "Wallpaper",
};

/**
 * Resuelve un layout por id. Si el id es undefined/null/""/no existe en el
 * registry, devuelve `DEFAULT_LAYOUT` (no rompe Home).
 */
export function getLayout(id: string | undefined | null): HomeLayout {
  if (id && typeof LAYOUTS[id] === "object") {
    return LAYOUTS[id];
  }
  return DEFAULT_LAYOUT;
}
