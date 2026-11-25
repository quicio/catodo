import { Icon } from "../../icons";
import type { HomeSlotProps } from "./types";

/**
 * Botón flotante para abrir Ajustes desde el Home.
 *
 * La configuración de wallpaper (like/dislike, pedir más fondos) vive en la
 * pestaña "Fondo" de Ajustes; acá sólo queda el acceso al panel.
 */
export function SettingsButton({ homeState }: HomeSlotProps) {
  const { toggleConfig } = homeState;

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
        type="button"
        aria-label="Configuración"
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
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
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
