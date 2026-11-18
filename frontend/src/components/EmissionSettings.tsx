import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { api, type LibraryInfo } from "../api/client";
import { Icon, type IconName } from "../icons";

const ICONS: IconName[] = [
  "clapperboard",
  "tv",
  "monitor-play",
  "play",
  "gamepad",
  "music",
];

const DEFAULT_COLOR = "#ffcc00";

type Draft = {
  name: string;
  path: string;
  kind: "series" | "videos";
  icon: IconName;
  color: string;
  order: number;
};

const emptyDraft = (order: number): Draft => ({
  name: "",
  path: "",
  kind: "series",
  icon: "clapperboard",
  color: DEFAULT_COLOR,
  order,
});

const sectionLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "12px 8px 4px",
  fontFamily: "var(--font-mono)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "6px 8px",
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  fontFamily: "var(--font-mono)",
  color: "var(--text-dim)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "var(--text)",
  background: "color-mix(in srgb, var(--text) 4%, transparent)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
};

const buttonStyle: CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: 1.5,
  cursor: "pointer",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function EmissionSettings() {
  const [libraries, setLibraries] = useState<LibraryInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLibraries(await api.libraries());
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const reload = () => {
      load();
    };
    window.addEventListener("catodo:libraries_changed", reload);
    return () => window.removeEventListener("catodo:libraries_changed", reload);
  }, [load]);

  const startCreate = () => {
    setEditing("new");
    setDraft(emptyDraft(10 + libraries.length));
    setError(null);
  };

  const startEdit = (library: LibraryInfo) => {
    setEditing(library.id);
    setDraft({
      name: library.name,
      path: library.path,
      kind: library.kind === "videos" ? "videos" : "series",
      icon: ICONS.includes(library.icon as IconName)
        ? (library.icon as IconName)
        : "clapperboard",
      color: library.color || DEFAULT_COLOR,
      order: library.order ?? 10,
    });
    setError(null);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.path.trim()) {
      setError("Nombre y carpeta son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing === "new") {
        await api.addLibrary(draft);
      } else if (editing) {
        await api.updateLibrary(editing, draft);
      }
      setEditing(null);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (library: LibraryInfo) => {
    if (
      typeof window.confirm === "function" &&
      !window.confirm(`¿Borrar el canal "${library.name}"?`)
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.removeLibrary(library.id);
      if (editing === library.id) setEditing(null);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-dim)" }}>
        Un canal de emisión es una carpeta local con series/temporadas o videos
        planos. Podés crear tantos como quieras.
      </div>

      <div style={sectionLabel}>
        CANALES DE EMISIÓN ({libraries.length})
        <button
          type="button"
          style={{ ...buttonStyle, float: "right", marginTop: -4 }}
          onClick={startCreate}
        >
          NUEVO
        </button>
      </div>

      {editing && (
        <div
          style={{
            margin: "4px 8px 10px",
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "color-mix(in srgb, var(--text) 3%, transparent)",
          }}
        >
          <div style={rowStyle}>
            <span style={labelStyle}>NOMBRE</span>
            <input
              style={inputStyle}
              value={draft.name}
              placeholder="Saint Seiya, Sci-fi Movies…"
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>CARPETA (local-only)</span>
            <input
              style={inputStyle}
              value={draft.path}
              placeholder="/media/Saint Seiya"
              onChange={(event) =>
                setDraft((current) => ({ ...current, path: event.target.value }))
              }
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>MODO</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["series", "videos"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  style={{
                    ...buttonStyle,
                    borderColor:
                      draft.kind === kind ? "var(--accent-soft)" : "var(--border)",
                  }}
                  onClick={() => setDraft((current) => ({ ...current, kind }))}
                >
                  {kind === "series" ? "SERIES" : "VIDEOS"}
                </button>
              ))}
            </div>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>ICONO</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  aria-label={icon}
                  title={icon}
                  style={{
                    ...buttonStyle,
                    borderColor:
                      draft.icon === icon ? "var(--accent-soft)" : "var(--border)",
                  }}
                  onClick={() => setDraft((current) => ({ ...current, icon }))}
                >
                  <Icon name={icon} size={15} color="currentColor" />
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ ...rowStyle, flex: 1 }}>
              <span style={labelStyle}>COLOR</span>
              <input
                type="color"
                value={draft.color}
                style={{ ...inputStyle, padding: 2, height: 30 }}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, color: event.target.value }))
                }
              />
            </label>
            <label style={{ ...rowStyle, width: 100 }}>
              <span style={labelStyle}>ORDEN</span>
              <input
                type="number"
                value={draft.order}
                style={inputStyle}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    order: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "6px 8px" }}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              CANCELAR
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, borderColor: "var(--accent-soft)" }}
              onClick={save}
              disabled={saving}
            >
              {saving ? "GUARDANDO…" : "GUARDAR"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            margin: "4px 8px",
            padding: "6px 8px",
            fontSize: 10,
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {error}
        </div>
      )}

      {libraries.length === 0 && !editing ? (
        <div style={{ padding: "10px 10px", fontSize: 11, opacity: 0.65 }}>
          No hay canales de emisión. Creá el primero con NUEVO.
        </div>
      ) : (
        libraries.map((library) => (
          <div
            key={library.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Icon
              name={
                ICONS.includes(library.icon as IconName)
                  ? (library.icon as IconName)
                  : "clapperboard"
              }
              size={16}
              color={library.color || "var(--text-dim)"}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {library.name}
              </div>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-dim)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {library.kind === "videos" ? "VIDEOS" : "SERIES"} · {library.path}
              </div>
            </div>
            <button type="button" style={buttonStyle} onClick={() => startEdit(library)}>
              EDITAR
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, color: "var(--danger)" }}
              onClick={() => remove(library)}
              disabled={saving}
            >
              BORRAR
            </button>
          </div>
        ))
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}
