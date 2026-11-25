/**
 * Registro de iconos de identidad de canal.
 *
 * Los iconos de UI siguen siendo semánticos (`icons.tsx`), pero los canales
 * tienen además un logo de marca opcional. `ChannelIcon` resuelve, en orden:
 *
 *   1. el nombre de marca guardado en `icon` (ej. "netflix"),
 *   2. el id del canal built-in (ej. `youtube` → logo de YouTube),
 *   3. el glifo semántico del pack activo.
 *
 * La dimensión de tema `channelIcons` decide entre glifos y logos. Cuando la
 * marca no tiene logo (Disney+, Pluto, etc.) o el tema usa glifos, se cae al
 * equivalente semántico para que nada quede vacío.
 *
 * Este archivo es parte del registro de iconos: es el único lugar (junto a
 * `icons.tsx`) que puede importar una librería de iconos directamente.
 */
import type { CSSProperties } from "react";
import type { IconType } from "react-icons";
import {
  SiAppletv,
  SiCrunchyroll,
  SiHbomax,
  SiMovistar,
  SiNetflix,
  SiParamountplus,
  SiPlex,
  SiSpotify,
  SiTwitch,
  SiVlcmediaplayer,
  SiYoutube,
} from "react-icons/si";
import { Icon, isIconName, type IconName } from "./icons";
import { useTheme } from "./theme";

export type BrandIconName =
  | "spotify"
  | "youtube"
  | "crunchyroll"
  | "hbomax"
  | "netflix"
  | "appletv"
  | "paramount"
  | "twitch"
  | "plex"
  | "vlc"
  | "movistar";

export const BRAND_ICON_NAMES: BrandIconName[] = [
  "spotify",
  "youtube",
  "crunchyroll",
  "netflix",
  "hbomax",
  "appletv",
  "paramount",
  "twitch",
  "plex",
  "vlc",
  "movistar",
];

const BRAND_COMPONENTS: Record<BrandIconName, IconType> = {
  spotify: SiSpotify,
  youtube: SiYoutube,
  crunchyroll: SiCrunchyroll,
  hbomax: SiHbomax,
  netflix: SiNetflix,
  appletv: SiAppletv,
  paramount: SiParamountplus,
  twitch: SiTwitch,
  plex: SiPlex,
  vlc: SiVlcmediaplayer,
  movistar: SiMovistar,
};

/** Alias aceptados en `icon`/manifests → nombre canónico de marca. */
const BRAND_ALIASES: Record<string, BrandIconName> = {
  max: "hbomax",
  hbo: "hbomax",
  "hbo-max": "hbomax",
  "paramount-plus": "paramount",
  "paramountplus": "paramount",
  "apple-tv": "appletv",
  "vlc-media-player": "vlc",
};

/** Glifo genérico cuando un logo no aplica (tema de glifos o sin logo). */
const BRAND_FALLBACK: Record<BrandIconName, IconName> = {
  spotify: "music",
  youtube: "monitor-play",
  crunchyroll: "play",
  hbomax: "play",
  netflix: "play",
  appletv: "play",
  paramount: "play",
  twitch: "play",
  plex: "play",
  vlc: "play",
  movistar: "tv",
};

/** Ids de canales built-in → logo de marca. */
const CHANNEL_BRANDS: Record<string, BrandIconName> = {
  spotify: "spotify",
  youtube: "youtube",
  crunchyroll: "crunchyroll",
  hbomax: "hbomax",
  max: "hbomax",
  netflix: "netflix",
  appletv: "appletv",
  paramount: "paramount",
  twitch: "twitch",
  plex: "plex",
  vlc: "vlc",
  movistar: "movistar",
};

/** Ids de canales sin logo → glifo por defecto. */
const CHANNEL_FALLBACK: Record<string, IconName> = {
  spotify: "music",
  youtube: "monitor-play",
  anime: "clapperboard",
  tv: "tv",
  crunchyroll: "play",
  arcade: "gamepad",
  iptv: "tv",
  cast: "monitor-play",
  "screen-cast": "monitor-play",
};

export function isBrandIconName(value: string | undefined): value is BrandIconName {
  return !!value && value in BRAND_COMPONENTS;
}

/** Resuelve un nombre de marca, aceptando alias. */
export function resolveBrand(value: string | undefined): BrandIconName | undefined {
  if (!value) return undefined;
  if (isBrandIconName(value)) return value;
  return BRAND_ALIASES[value];
}

/** Glifo de respaldo para un canal cuando su `icon` no es válido. */
export function channelFallbackIcon(
  channelId?: string,
  channelType?: string,
): IconName {
  if (channelId && CHANNEL_FALLBACK[channelId]) return CHANNEL_FALLBACK[channelId];
  return channelType === "web" ? "monitor-play" : "tv";
}

/**
 * Normaliza el `icon` de un canal: conserva nombres semánticos y de marca
 * válidos; si no, usa el glifo por defecto del canal.
 */
export function channelIconName(
  channelId: string | undefined,
  icon: string | undefined,
  channelType?: string,
): string {
  if (isIconName(icon) || isBrandIconName(icon)) return icon;
  return channelFallbackIcon(channelId, channelType);
}

/** Logo de marca puro, sin depender del modo del tema (para pickers). */
export function BrandGlyph({
  name,
  size = 24,
  color,
  className,
  style,
  title,
}: {
  name: BrandIconName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const Component = BRAND_COMPONENTS[name];
  return (
    <span title={title} style={{ display: "inline-flex", lineHeight: 0 }}>
      <Component size={size} color={color} className={className} style={style} />
    </span>
  );
}

export interface ChannelIconProps {
  channelId?: string;
  /** `icon` crudo del canal: glifo semántico o nombre de marca. */
  icon?: string;
  channelType?: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Sólo aplica a glifos; los logos de marca no mutan. */
  morphTo?: IconName;
  className?: string;
  style?: CSSProperties;
}

/**
 * Icono de identidad de canal. Usa el logo de marca si el tema/override lo
 * habilita y hay logo disponible; si no, el glifo semántico del pack activo.
 */
export function ChannelIcon({
  channelId,
  icon,
  channelType,
  size = 24,
  color,
  strokeWidth = 2,
  morphTo,
  className,
  style,
}: ChannelIconProps) {
  const { theme, overrides } = useTheme();
  const mode = overrides.channelIcons ?? theme.channelIcons ?? "glyph";
  const brand =
    resolveBrand(icon) ?? (channelId ? CHANNEL_BRANDS[channelId] : undefined);

  if (mode === "brand" && brand) {
    return (
      <BrandGlyph
        name={brand}
        size={size}
        color={color}
        className={className}
        style={style}
      />
    );
  }

  const fallback = brand ? BRAND_FALLBACK[brand] : undefined;
  const semantic = isIconName(icon)
    ? icon
    : fallback ?? channelFallbackIcon(channelId, channelType);

  return (
    <Icon
      name={semantic}
      morphTo={morphTo}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
    />
  );
}
