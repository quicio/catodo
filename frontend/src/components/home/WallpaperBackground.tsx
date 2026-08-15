import type { HomeSlotProps } from "./types";

/**
 * Capa de fondo: portada Spotify blur (si suena) o wallpapers rotativos
 * + overlay oscuro para legibilidad.
 *
 * z-index 0–1 (debajo del contenido principal).
 */
export function WallpaperBackground({ homeState }: HomeSlotProps) {
  const { wallpapers, artistWp, wpIndex, coverReady, showSpotifyBg, spotifyArtUrl } = homeState;

  return (
    <>
      {showSpotifyBg ? (
        <>
          {spotifyArtUrl && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url(${spotifyArtUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(30px) saturate(1.3) brightness(0.6)",
                transform: "scale(1.15)",
                zIndex: 0,
              }}
            />
          )}
          {artistWp.length > 0 &&
            artistWp.map((wp, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${wp})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: coverReady && i === wpIndex % artistWp.length ? 1 : 0,
                  transition: "opacity 3s ease",
                  zIndex: 0,
                }}
              />
            ))}
        </>
      ) : (
        wallpapers.map((wp, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${wp})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: i === wpIndex % wallpapers.length ? 1 : 0,
              transition: "opacity 1.2s ease",
              zIndex: 0,
            }}
          />
        ))
      )}
      {/* Overlay oscuro para legibilidad de texto */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg) 35%, transparent) 0%, color-mix(in srgb, var(--bg) 55%, transparent) 100%)",
          zIndex: 1,
        }}
      />
    </>
  );
}
