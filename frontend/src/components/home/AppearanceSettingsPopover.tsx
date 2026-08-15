import AppearanceSettings from "../AppearanceSettings";
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
  const { showConfig, openPair, closePair } = homeState;

  if (!showConfig) return null;

  return (
    <div
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
        width: "min(360px, 90vw)",
        maxHeight: "min(70vh, 640px)",
        fontFamily: "var(--font-mono)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
      }}
    >
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
