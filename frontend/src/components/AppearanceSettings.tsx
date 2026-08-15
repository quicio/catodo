/**
 * Panel de apariencia: galería de temas + personalizaciones granulares.
 * Cada control tiene la opción "Tema" que limpia el override (vuelve al
 * valor del theme activo). Los cambios se aplican optimistas y persisten
 * vía POST /api/config (manejado por los setters del ThemeContext).
 */
import type { CSSProperties } from "react";
import {
  FONT_STACKS,
  useTheme,
  type DensityId,
  type FontId,
  type IconPackId,
  type ShapeId,
} from "../theme";
import { Icon, PACKS } from "../icons";

const FONT_LABELS: Record<FontId, string> = {
  "space-grotesk": "Space Grotesk",
  "jetbrains-mono": "JetBrains Mono",
  inter: "Inter",
  nunito: "Nunito",
  oswald: "Oswald",
  orbitron: "Orbitron",
  vt323: "VT323",
  "ibm-plex-mono": "IBM Plex Mono",
};

const SHAPE_LABELS: Record<ShapeId, string> = {
  square: "Cuadrados",
  rounded: "Redondos",
  pill: "Píldora",
};

const DENSITY_LABELS: Record<DensityId, string> = {
  compact: "Compacta",
  comfortable: "Media",
  spacious: "Espaciosa",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 10px",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  textAlign: "left",
};

const sectionLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "10px 8px 4px",
  fontFamily: "var(--font-mono)",
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T | ""; label: string; font?: string }[];
  value: T | "";
  onChange: (v: T | "") => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        padding: "2px 8px 4px",
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id || "__default"}
            onClick={() => onChange(o.id)}
            style={{
              padding: "5px 9px",
              fontSize: 11,
              fontFamily: o.font ?? "var(--font-mono)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              background: active
                ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                : "transparent",
              color: active ? "var(--text)" : "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  return (
    <div style={{ padding: "6px 10px 2px" }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
        {label}
      </div>
      <Segmented<"on" | "off">
        value={value === undefined ? "" : value ? "on" : "off"}
        onChange={(v) => onChange(v === "" ? undefined : v === "on")}
        options={[
          { id: "", label: "Tema" },
          { id: "on", label: "ON" },
          { id: "off", label: "OFF" },
        ]}
      />
    </div>
  );
}

export default function AppearanceSettings({ onPair }: { onPair: () => void }) {
  const { theme, themes, setTheme, overrides, setOverride } = useTheme();

  return (
    <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
      <div style={{ ...sectionLabel, paddingTop: 4 }}>CONFIGURACIÓN</div>
      <button onClick={onPair} style={rowStyle}>
        <Icon name="smartphone" size={18} color="var(--text-dim)" />
        Conectar teléfono
      </button>

      {/* Galería de temas */}
      <div style={sectionLabel}>TEMAS</div>
      {themes.map((t) => {
        const active = t.id === theme.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            style={{
              ...rowStyle,
              background: active
                ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                : "transparent",
              color: active ? "var(--text)" : "var(--text-dim)",
              borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
            }}
          >
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
              {[t.colors.accent, t.colors.accentSoft, t.colors.bg].map((c, i) => (
                <span
                  key={i}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: c,
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </span>
            <span style={{ fontFamily: FONT_STACKS[t.typography.display] }}>{t.name}</span>
          </button>
        );
      })}

      {/* Personalizaciones granulares */}
      <div style={sectionLabel}>PERSONALIZACIÓN</div>

      <div style={{ padding: "6px 10px 2px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        Fuente
      </div>
      <Segmented<FontId>
        value={overrides.font ?? ""}
        onChange={(v) => setOverride("font", v || undefined)}
        options={[
          { id: "", label: "Tema" },
          ...(Object.keys(FONT_LABELS) as FontId[]).map((f) => ({
            id: f as FontId,
            label: FONT_LABELS[f],
            font: FONT_STACKS[f],
          })),
        ]}
      />

      <div style={{ padding: "6px 10px 2px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        Iconos
      </div>
      <Segmented<IconPackId>
        value={overrides.iconPack ?? ""}
        onChange={(v) => setOverride("iconPack", v || undefined)}
        options={[
          { id: "", label: "Tema" },
          ...(Object.keys(PACKS) as IconPackId[]).map((p) => ({
            id: p,
            label: PACKS[p].label,
          })),
        ]}
      />

      <div style={{ padding: "6px 10px 2px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        Bordes
      </div>
      <Segmented<ShapeId>
        value={overrides.radius ?? ""}
        onChange={(v) => setOverride("radius", v || undefined)}
        options={[
          { id: "", label: "Tema" },
          ...(Object.keys(SHAPE_LABELS) as ShapeId[]).map((s) => ({
            id: s,
            label: SHAPE_LABELS[s],
          })),
        ]}
      />

      <div style={{ padding: "6px 10px 2px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        Densidad
      </div>
      <Segmented<DensityId>
        value={overrides.density ?? ""}
        onChange={(v) => setOverride("density", v || undefined)}
        options={[
          { id: "", label: "Tema" },
          ...(Object.keys(DENSITY_LABELS) as DensityId[]).map((d) => ({
            id: d,
            label: DENSITY_LABELS[d],
          })),
        ]}
      />

      <TriState
        label="Efectos CRT"
        value={overrides.crt}
        onChange={(v) => setOverride("crt", v)}
      />
      <TriState
        label="Glow"
        value={overrides.glow}
        onChange={(v) => setOverride("glow", v)}
      />
      <div style={{ height: 6 }} />
    </div>
  );
}
