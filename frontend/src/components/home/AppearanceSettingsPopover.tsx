import AppearanceSettings from "../AppearanceSettings";
import { Icon } from "../../icons";
import { api } from "../../api/client";
import type { HomeSlotProps } from "./types";

/**
 * Popover de tema/overrides. Posicionado en la misma zona que el botón ⚙
 * (right: 24, top: 50% + offset). Se muestra cuando `homeState.showConfig`.
 *
 * El selector de Layout no está en homeState (es estado de App, no del Home) —
 * lo gestiona el orquestador vía props.
 */
export function AppearanceSettingsPopover({
  homeState,
  layoutId,
  onLayoutChange,
}: HomeSlotProps) {
  const { showConfig, openPair, closePair, toggleConfig } = homeState;

  if (!showConfig) return null;

  return (
    <div
      role="dialog"
      aria-label="Ajustes de Cátodo"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        right: 88,
        top: "50%",
        transform: "translateY(-50%)",
        background: "var(--surface)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 10,
        width: "min(480px, 92vw)",
        maxHeight: "min(70vh, 640px)",
        fontFamily: "var(--font-mono)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 8px 8px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 11, letterSpacing: 2, color: "var(--text-dim)" }}>
          AJUSTES
        </span>
        <button
          type="button"
          aria-label="Cerrar ajustes"
          onClick={toggleConfig}
          style={{
            width: 30,
            height: 30,
            display: "grid",
            placeItems: "center",
            background: "transparent",
            color: "var(--text-dim)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Icon name="x" size={16} strokeWidth={2} color="currentColor" />
        </button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <AppearanceSettings
          onPair={() => {
            closePair();
            openPair();
          }}
          layoutId={layoutId}
          onLayoutChange={(id) => {
            if (onLayoutChange) onLayoutChange(id);
            api.setConfig({ home_layout_id: id }).catch(console.warn);
          }}
        />
      </div>
    </div>
  );
}
