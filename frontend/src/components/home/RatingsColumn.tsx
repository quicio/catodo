import { Icon } from "../../icons";
import type { HomeSlotProps } from "./types";

/**
 * Columna derecha fija: thumbs-up/down + botón ⚙.
 *
 * El popover de tema se monta como un slot overlay separado
 * (appearance-settings-popover). El botón ⚙ solo dispara `toggleConfig`.
 */
export function RatingsColumn({ homeState }: HomeSlotProps) {
  const { wallpapers, artistWp, wpIndex, ratings, showSpotifyBg, onRate, toggleConfig } = homeState;

  const activeList = showSpotifyBg && artistWp.length > 0 ? artistWp : wallpapers;
  const curWp = activeList[wpIndex % activeList.length];
  const curId = curWp
    ? curWp.split("/").pop()?.split(".")[0] || curWp
    : null;
  const cur = curId ? ratings[curId] : undefined;
  const isUp = cur === "up";
  const isDown = cur === "down";

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        zIndex: 3,
      }}
    >
      <button
        onClick={() => curId && onRate(curId, isUp ? "none" : "up")}
        title="Me gusta este wallpaper"
        style={{
          width: 52,
          height: 52,
          boxSizing: "border-box",
          flexShrink: 0,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isUp
            ? "color-mix(in srgb, var(--accent) 35%, transparent)"
            : isDown
              ? "color-mix(in srgb, var(--text) 4%, transparent)"
              : "color-mix(in srgb, var(--text) 10%, transparent)",
          border: `1px solid ${isUp ? "var(--accent)" : "color-mix(in srgb, var(--text) 25%, transparent)"}`,
          color: isUp ? "var(--accent)" : "var(--text)",
          cursor: "pointer",
          outline: "none",
          WebkitTapHighlightColor: "transparent",
          transition: "background 0.15s ease, border-color 0.15s ease",
          opacity: isDown ? 0.4 : 1,
        }}
      >
        <Icon
          name="thumbs-up"
          morphTo={isUp ? "check" : undefined}
          size={22}
          strokeWidth={2}
          color={isUp ? "var(--accent)" : "var(--text)"}
          style={{ display: "block", lineHeight: 0 }}
        />
      </button>
      <button
        onClick={() => curId && onRate(curId, isDown ? "none" : "down")}
        title="No me gusta este wallpaper (no vuelve a salir)"
        style={{
          width: 52,
          height: 52,
          boxSizing: "border-box",
          flexShrink: 0,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDown
            ? "color-mix(in srgb, var(--danger) 35%, transparent)"
            : isUp
              ? "color-mix(in srgb, var(--text) 4%, transparent)"
              : "color-mix(in srgb, var(--text) 10%, transparent)",
          border: `1px solid ${isDown ? "var(--danger)" : "color-mix(in srgb, var(--text) 25%, transparent)"}`,
          color: isDown ? "var(--danger)" : "var(--text)",
          cursor: "pointer",
          outline: "none",
          WebkitTapHighlightColor: "transparent",
          transition: "background 0.15s ease, border-color 0.15s ease",
          opacity: isUp ? 0.4 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isDown && !isUp)
            (e.currentTarget as HTMLButtonElement).style.background =
              "color-mix(in srgb, var(--danger) 25%, transparent)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = isDown
            ? "color-mix(in srgb, var(--danger) 35%, transparent)"
            : isUp
              ? "color-mix(in srgb, var(--text) 4%, transparent)"
              : "color-mix(in srgb, var(--text) 10%, transparent)";
        }}
      >
        <Icon
          name="thumbs-down"
          morphTo={isDown ? "x" : undefined}
          size={22}
          strokeWidth={2}
          color={isDown ? "var(--danger)" : "var(--text)"}
          style={{ display: "block", lineHeight: 0 }}
        />
      </button>
      <button
        onClick={toggleConfig}
        title="Configuración"
        style={{
          width: 52,
          height: 52,
          boxSizing: "border-box",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "color-mix(in srgb, var(--text) 10%, transparent)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          cursor: "pointer",
          outline: "none",
          backdropFilter: "blur(8px)",
        }}
      >
        <Icon
          name="settings"
          size={24}
          strokeWidth={2}
          color="var(--text)"
          style={{ display: "block", lineHeight: 0 }}
        />
      </button>
    </div>
  );
}
