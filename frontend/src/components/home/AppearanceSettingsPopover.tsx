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
      className="settings-panel"
      role="dialog"
      aria-label="Ajustes de Cátodo"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="settings-header">
        <span className="settings-title">AJUSTES</span>
        <button
          type="button"
          className="settings-close"
          aria-label="Cerrar ajustes"
          onClick={toggleConfig}
        >
          <Icon name="x" size={16} strokeWidth={2} color="currentColor" />
        </button>
      </div>
      <AppearanceSettings
        homeState={homeState}
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
  );
}
