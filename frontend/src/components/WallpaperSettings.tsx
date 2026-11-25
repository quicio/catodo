import type { CSSProperties } from "react";
import { Icon } from "../icons";
import type { SharedHomeState } from "./home/types";

const wpId = (url: string) => url.split("/").pop()?.split(".")[0] || url;

const sectionLabel = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "10px 8px 4px",
  fontFamily: "var(--font-mono)",
};

const actionButton = (active = false, danger = false): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "7px 10px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  borderRadius: "var(--radius-sm)",
  border: `1px solid ${
    active ? (danger ? "var(--danger)" : "var(--accent)") : "var(--border)"
  }`,
  background: active
    ? danger
      ? "color-mix(in srgb, var(--danger) 18%, transparent)"
      : "color-mix(in srgb, var(--accent) 18%, transparent)"
    : "transparent",
  color: active
    ? danger
      ? "var(--danger)"
      : "var(--text)"
    : "var(--text-dim)",
  cursor: "pointer",
});

/**
 * Pestaña "Fondo" de Ajustes: preview del wallpaper activo, like/dislike,
 * descarga explícita de más fondos y restauración de los descartados.
 *
 * El Home ya no muestra la columna flotante de ratings; esta es la única
 * superficie de configuración de wallpapers.
 */
export default function WallpaperSettings({
  homeState,
}: {
  homeState: SharedHomeState;
}) {
  const {
    wallpapers,
    artistWp,
    wpIndex,
    ratings,
    showSpotifyBg,
    loadingWp,
    onRate,
    requestMoreWallpapers,
    restoreWallpapers,
  } = homeState;

  const usingArtist = showSpotifyBg && artistWp.length > 0;
  const activeList = usingArtist ? artistWp : wallpapers;
  const current = activeList.length > 0 ? activeList[wpIndex % activeList.length] : null;
  const currentId = current ? wpId(current) : null;
  const currentRating = currentId ? ratings[currentId] : undefined;
  const hiddenCount = Object.values(ratings).filter((r) => r === "down").length;
  const visibleCount = wallpapers.filter((u) => ratings[wpId(u)] !== "down").length;

  return (
    <>
      <div style={sectionLabel}>FONDO ACTUAL</div>
      {current ? (
        <div style={{ padding: "4px 10px 8px", maxWidth: 460 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              overflow: "hidden",
              background: "#000",
            }}
          >
            <img
              src={current}
              alt="Wallpaper actual"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 8,
                top: 8,
                padding: "3px 7px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(0,0,0,0.62)",
                color: "#fff",
                fontSize: 9,
                letterSpacing: 1.5,
                fontFamily: "var(--font-mono)",
              }}
            >
              {usingArtist ? "ARTISTA" : "GALERÍA"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              aria-pressed={currentRating === "up"}
              onClick={() => onRate(currentId!, currentRating === "up" ? "none" : "up")}
              style={{ ...actionButton(currentRating === "up"), flex: 1 }}
            >
              <Icon name="thumbs-up" size={15} strokeWidth={2} color="currentColor" />
              Me gusta
            </button>
            <button
              type="button"
              aria-pressed={currentRating === "down"}
              onClick={() => onRate(currentId!, currentRating === "down" ? "none" : "down")}
              style={{ ...actionButton(currentRating === "down", true), flex: 1 }}
            >
              <Icon name="thumbs-down" size={15} strokeWidth={2} color="currentColor" />
              No me gusta
            </button>
          </div>
          {currentId && (
            <div
              style={{
                marginTop: 6,
                fontSize: 9,
                letterSpacing: 1,
                color: "var(--text-dim)",
                opacity: 0.6,
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={currentId}
            >
              ID {currentId}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--text-dim)",
            opacity: 0.6,
          }}
        >
          No hay fondos todavía.
        </div>
      )}

      <div style={sectionLabel}>BIBLIOTECA</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 10px 8px",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
        }}
      >
        <span>{visibleCount} fondos visibles</span>
        <span>{hiddenCount} descartados</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 10px 6px" }}>
        <button
          type="button"
          onClick={() => void requestMoreWallpapers()}
          disabled={loadingWp}
          style={{
            ...actionButton(),
            flex: 1,
            opacity: loadingWp ? 0.6 : 1,
            cursor: loadingWp ? "wait" : "pointer",
          }}
        >
          {loadingWp ? "Buscando fondos…" : "Buscar más fondos"}
        </button>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={restoreWallpapers}
            style={{ ...actionButton(), flex: 1 }}
          >
            Restaurar descartados
          </button>
        )}
      </div>

      <div style={sectionLabel}>ROTACIÓN</div>
      <p
        style={{
          margin: 0,
          padding: "2px 10px 10px",
          fontSize: 11,
          lineHeight: 1.5,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
        }}
      >
        Los fondos rotan cada 12 segundos. "No me gusta" excluye el fondo de la
        rotación; podés recuperarlo con "Restaurar descartados".
      </p>
      <div style={{ height: 6 }} />
    </>
  );
}
