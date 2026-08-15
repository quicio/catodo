import type { HomeLayout } from "./types";

/**
 * Layout default — replica la composición actual del Home.
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
