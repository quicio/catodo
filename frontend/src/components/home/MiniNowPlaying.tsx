import type { HomeSlotProps } from "./types";

/**
 * "Now Playing" minimalista (top-right). Solo se muestra cuando suena Spotify.
 */
export function MiniNowPlaying({ state, homeState }: HomeSlotProps) {
  const spotify = state.spotify;
  const { showSpotifyBg } = homeState;

  if (!showSpotifyBg || !spotify?.title) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        right: 40,
        zIndex: 2,
        textAlign: "right",
        fontFamily: "var(--font-display)",
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 3, fontFamily: "var(--font-mono)" }}>
        ♫ NOW PLAYING
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{spotify.title}</div>
      <div style={{ fontSize: 14, opacity: 0.6 }}>{spotify.artist}</div>
    </div>
  );
}
