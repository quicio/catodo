/**
 * Panel de configuración con tabs:
 *   General:    pareo, ajustes del canal Spotify (historial on/off + límite).
 *   Apariencia: tema activo, layout del Home.
 *   Tipografía: fuente, pack de iconos, bordes, densidad.
 *   Efectos:    CRT, glow, escala global de UI.
 *
 * Los cambios se aplican optimistas y persisten vía POST /api/config. Los
 * eventos `config_changed` que broadcastea el backend (vía WebSocket)
 * sincronizan a otros suscriptores (ej. NowPlaying del Spotify).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { api, type ModePreset, type RuntimeConfig } from "../api/client";
import {
  FONT_STACKS,
  useTheme,
  useUiScale,
  type DensityId,
  type FontId,
  type IconPackId,
  type ShapeId,
} from "../theme";
import { LAYOUTS, LAYOUT_LABELS } from "./home";
import { Icon, PACKS } from "../icons";
import { TunnelSection } from "./TunnelSection";

type TabId = "general" | "modos" | "apariencia" | "tipografia" | "efectos" | "dominio";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "modos", label: "Modos" },
  { id: "apariencia", label: "Apariencia" },
  { id: "tipografia", label: "Tipografía" },
  { id: "efectos", label: "Efectos" },
  { id: "dominio", label: "Dominio" },
];

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

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "4px 6px",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        background: "var(--surface)",
        zIndex: 1,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              flex: "1 0 auto",
              minWidth: 60,
              padding: "7px 8px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: 1,
              border: "none",
              borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              borderRadius: 0,
              background: "transparent",
              color: isActive ? "var(--text)" : "var(--text-dim)",
              cursor: "pointer",
              transition: "color 0.15s ease, border-color 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AppearanceSettings({
  onPair,
  layoutId = "default",
  onLayoutChange,
}: {
  onPair: () => void;
  layoutId?: string;
  onLayoutChange?: (id: string) => void;
}) {
  const { theme, themes, setTheme, overrides, setOverride } = useTheme();
  const { scale, setScale } = useUiScale();
  const [tab, setTab] = useState<TabId>("general");

  // Presets de modo: lista + acciones CRUD + aplicar. La config efectiva
  // (que el panel usa como fuente para "Guardar modo actual") se hidrata
  // desde /api/config al montar y se mantiene fresca vía `config_changed`.
  const [presets, setPresets] = useState<ModePreset[]>([]);
  const [effectiveConfig, setEffectiveConfig] = useState<RuntimeConfig | null>(null);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refreshPresets = async () => {
    try {
      const r = await api.modes();
      setPresets(r.presets);
    } catch (e) {
      console.warn("modes: list failed", e);
    }
  };

  useEffect(() => {
    refreshPresets();
    api.config().then(setEffectiveConfig).catch(() => {});
  }, []);

  // Refrescar presets cuando el backend broadcastea config_changed con key
  // `mode_presets` (un cambio en la lista). Cualquier otra clave sólo refresca
  // el config efectivo para que "Guardar modo actual" tome lo último.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string; value?: unknown }>).detail;
      if (!detail) return;
      if (detail.key === "mode_presets") {
        refreshPresets();
      } else if (
        detail.key === "theme" ||
        detail.key === "home_layout_id" ||
        detail.key === "ui_scale" ||
        detail.key === "favorite_channels"
      ) {
        api.config().then(setEffectiveConfig).catch(() => {});
      }
    };
    window.addEventListener("catodo:config_changed", onChange as EventListener);
    return () => window.removeEventListener("catodo:config_changed", onChange as EventListener);
  }, []);

  const saveCurrentAsPreset = async () => {
    const name = newPresetName.trim();
    if (!name) return;
    setPresetsLoading(true);
    try {
      // Snapshot del estado efectivo: si no hay `effectiveConfig` todavía,
      // pedimos uno fresco.
      const cfg = effectiveConfig ?? (await api.config());
      const payload: Record<string, unknown> = {};
      if (typeof cfg.theme === "string") payload.theme = cfg.theme;
      if (typeof cfg.home_layout_id === "string") payload.home_layout_id = cfg.home_layout_id;
      if (typeof cfg.ui_scale === "number") payload.ui_scale = cfg.ui_scale;
      if (Array.isArray(cfg.favorite_channels)) payload.favorite_channels = cfg.favorite_channels;
      await api.createMode(name, payload);
      setNewPresetName("");
      await refreshPresets();
    } catch (e) {
      console.warn("modes: create failed", e);
    } finally {
      setPresetsLoading(false);
    }
  };

  const applyPreset = async (id: string) => {
    try {
      await api.applyMode(id);
      // El backend broadcastea config_changed por clave — el kiosko se
      // actualiza solo; no hace falta tocar nada acá.
    } catch (e) {
      console.warn("modes: apply failed", e);
    }
  };

  const renamePreset = async (id: string) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    try {
      await api.updateMode(id, { name });
      setRenamingId(null);
      await refreshPresets();
    } catch (e) {
      console.warn("modes: rename failed", e);
    }
  };

  const removePreset = async (id: string) => {
    try {
      await api.deleteMode(id);
      await refreshPresets();
    } catch (e) {
      console.warn("modes: delete failed", e);
    }
  };

  return (
    <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
      <TabBar active={tab} onChange={setTab} />

      {/* ==== GENERAL ==== */}
      {tab === "general" && (
        <>
          <div style={sectionLabel}>CONEXIÓN</div>
          <button onClick={onPair} style={rowStyle}>
            <Icon name="smartphone" size={18} color="var(--text-dim)" />
            Conectar teléfono
          </button>
          <div style={{ height: 6 }} />
        </>
      )}

      {/* ==== MODOS ==== */}
      {tab === "modos" && (
        <>
          <div style={sectionLabel}>GUARDAR MODO ACTUAL</div>
          <div
            style={{
              padding: "6px 10px 10px",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Nombre del modo…"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrentAsPreset();
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                background: "transparent",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
              }}
            />
            <button
              onClick={saveCurrentAsPreset}
              disabled={!newPresetName.trim() || presetsLoading}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: newPresetName.trim() ? "var(--text)" : "var(--text-faint)",
                cursor: newPresetName.trim() ? "pointer" : "not-allowed",
              }}
            >
              Guardar
            </button>
          </div>

          <div style={sectionLabel}>MIS MODOS</div>
          {presets.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                opacity: 0.5,
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              Sin modos guardados. Creá uno arriba con la config actual.
            </div>
          ) : (
            presets.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => renamePreset(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renamePreset(p.id);
                      else if (e.key === "Escape") setRenamingId(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "3px 6px",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      background: "transparent",
                      color: "var(--text)",
                      border: "1px solid var(--accent)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                ) : (
                  <span
                    onClick={() => {
                      setRenamingId(p.id);
                      setRenameValue(p.name);
                    }}
                    title="Click para renombrar"
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text)",
                      cursor: "text",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name}
                  </span>
                )}
                <button
                  onClick={() => applyPreset(p.id)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-sm)",
                    background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  Aplicar
                </button>
                <button
                  onClick={() => removePreset(p.id)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                  }}
                >
                  Borrar
                </button>
              </div>
            ))
          )}
          <div style={{ height: 6 }} />
        </>
      )}

      {/* ==== APARIENCIA ==== */}
      {tab === "apariencia" && (
        <>
          <div style={sectionLabel}>TEMA</div>
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

          <div style={sectionLabel}>LAYOUT DEL HOME</div>
          <Segmented<string>
            value={layoutId}
            onChange={(v) => onLayoutChange?.(v)}
            options={(Object.keys(LAYOUTS) as Array<keyof typeof LAYOUTS>).map((id) => ({
              id,
              label: LAYOUT_LABELS[id] ?? id,
            }))}
          />
          <div style={{ height: 6 }} />
        </>
      )}

      {/* ==== TIPOGRAFÍA ==== */}
      {tab === "tipografia" && (
        <>
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
                id: s as ShapeId,
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
                id: d as DensityId,
                label: DENSITY_LABELS[d],
              })),
            ]}
          />
          <div style={{ height: 6 }} />
        </>
      )}

      {/* ==== EFECTOS ==== */}
      {tab === "efectos" && (
        <>
          <div style={sectionLabel}>EFECTOS</div>
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

          <div
            style={{
              padding: "10px 10px 4px",
              fontSize: 12,
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Escala de UI</span>
            <span style={{ opacity: 0.7 }}>{Math.round(scale * 100)}%</span>
          </div>
          <div style={{ padding: "2px 10px 10px", display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={0.6}
              max={2}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setScale(1)}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: "var(--text-dim)",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
          <div style={{ height: 6 }} />
        </>
      )}

      {/* ==== DOMINIO ==== */}
      {tab === "dominio" && (
        <>
          <div style={sectionLabel}>TÚNEL PÚBLICO</div>
          <TunnelSection enabled={true} />
          <div style={{ height: 6 }} />
        </>
      )}
    </div>
  );
}