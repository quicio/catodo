import type { ReactNode } from "react";
import type { AppState, ChannelInfo } from "../../api/client";

export type HomeComponentId =
  | "wallpaper-background"
  | "clock"
  | "mini-now-playing"
  | "brand"
  | "channel-grid"
  | "ratings-column"
  | "appearance-settings-popover"
  | "pair-modal";

export type HomeComponentPosition = "root" | "overlay";

export interface HomeComponentConfig {
  id: HomeComponentId;
  position?: HomeComponentPosition;
}

export interface HomeLayout {
  layoutId: string;
  components: HomeComponentConfig[];
}

export interface HomeSlotProps {
  config: HomeComponentConfig;
  state: AppState;
  channels: ChannelInfo[];
  onPick: (id: string) => void;
  // Estado compartido entre slots (ver useHomeState.ts).
  homeState: SharedHomeState;
}

export interface SharedHomeState {
  wallpapers: string[];
  ratings: Record<string, Rating>;
  wpIndex: number;
  loadingWp: boolean;
  artistWp: string[];
  coverReady: boolean;
  showSpotifyBg: boolean;
  spotifyArtUrl: string;
  now: Date;
  showConfig: boolean;
  showPair: boolean;
  pairInfo: { url?: string; code?: string } | null;
  onRate: (id: string, r: Rating) => void;
  toggleConfig: () => void;
  openPair: () => void;
  closePair: () => void;
}

export type Rating = "up" | "down" | "none";

export type HomeSlot = (props: HomeSlotProps) => ReactNode;
