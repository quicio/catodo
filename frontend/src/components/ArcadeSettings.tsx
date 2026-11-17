import type { CSSProperties } from "react";
import MonitorControls from "./MonitorControls";

const sectionLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "12px 8px 4px",
  fontFamily: "var(--font-mono)",
};

export default function ArcadeSettings() {
  return (
    <div>
      <div style={sectionLabel}>MONITOR</div>
      <MonitorControls />
      <div
        style={{
          padding: "8px 10px",
          fontSize: 10,
          lineHeight: 1.5,
          color: "var(--text-dim)",
          fontFamily: "var(--font-mono)",
          opacity: 0.7,
        }}
      >
        Estos valores también se pueden ajustar en vivo durante la partida con
        el botón <b>TV · F1</b> del player o la tecla <b>F1</b>. El botón POWER
        del televisor vuelve al launcher.
      </div>
    </div>
  );
}
