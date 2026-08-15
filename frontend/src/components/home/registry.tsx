import type { HomeComponentId, HomeSlot } from "./types";
import { WallpaperBackground } from "./WallpaperBackground";
import { Clock } from "./Clock";
import { MiniNowPlaying } from "./MiniNowPlaying";
import { Brand } from "./Brand";
import { ChannelGrid } from "./ChannelGrid";
import { RatingsColumn } from "./RatingsColumn";
import { AppearanceSettingsPopover } from "./AppearanceSettingsPopover";
import { PairModal } from "./PairModal";

/**
 * Registry que mapea cada id de slot a su componente. Agregar un nuevo
 * widget = sumar su id a `HomeComponentId`, su componente acá, y nada más.
 */
export const homeSlots: Record<HomeComponentId, HomeSlot> = {
  "wallpaper-background": WallpaperBackground,
  "clock": Clock,
  "mini-now-playing": MiniNowPlaying,
  "brand": Brand,
  "channel-grid": ChannelGrid,
  "ratings-column": RatingsColumn,
  "appearance-settings-popover": AppearanceSettingsPopover,
  "pair-modal": PairModal,
};

/**
 * Fallback silencioso: si el layout incluye un id que no está en el
 * registry (p. ej. un cambio viejo), Home no se rompe.
 */
export function UnknownSlot({ config }: { config: { id: string } }) {
  if (typeof window !== "undefined" && window.console?.debug) {
    window.console.debug(`[Home] Slot desconocido: ${config.id}`);
  }
  return null;
}
