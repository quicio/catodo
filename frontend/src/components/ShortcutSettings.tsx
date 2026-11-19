import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { api, type ChannelInfo } from "../api/client";
import {
  DEFAULT_JUMP_COMBO,
  comboFromEvent,
  jumpComboOr,
  normalizeCombo,
  sanitizeShortcuts,
  type CustomShortcut,
  type ShortcutAction,
} from "../shortcuts";

const ACTIONS: { value: ShortcutAction; label: string }[] = [
  { value: "channel", label: "Abrir canal" },
  { value: "menu", label: "Menú de canales" },
  { value: "settings", label: "Ajustes" },
  { value: "home", label: "Home" },
  { value: "volume_up", label: "Volumen +" },
  { value: "volume_down", label: "Volumen −" },
  { value: "next", label: "Canal siguiente" },
  { value: "previous", label: "Canal anterior" },
  { value: "fullscreen", label: "Pantalla completa" },
];

const sectionLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "12px 8px 4px",
  fontFamily: "var(--font-mono)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderBottom: "1px solid var(--border)",
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

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text)",
  background: "color-mix(in srgb, var(--text) 4%, transparent)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
};

const noteStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 10,
  lineHeight: 1.6,
  color: "var(--text-dim)",
  fontFamily: "var(--font-mono)",
  opacity: 0.75,
};

function actionLabel(shortcut: CustomShortcut, channels: ChannelInfo[]): string {
  if (shortcut.action === "channel") {
    return channels.find((channel) => channel.id === shortcut.channel)?.name ?? shortcut.channel ?? "canal";
  }
  return ACTIONS.find((action) => action.value === shortcut.action)?.label ?? shortcut.action;
}

export default function ShortcutSettings() {
  const [jumpCombo, setJumpCombo] = useState(DEFAULT_JUMP_COMBO);
  const [shortcuts, setShortcuts] = useState<CustomShortcut[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [capturing, setCapturing] = useState<"jump" | "custom" | null>(null);
  const [draftAction, setDraftAction] = useState<ShortcutAction>("channel");
  const [draftChannel, setDraftChannel] = useState("");
  const [draftCombo, setDraftCombo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [config, channelList] = await Promise.all([api.config(), api.channels()]);
      setJumpCombo(jumpComboOr(config.channel_jump_combo));
      setShortcuts(sanitizeShortcuts(config.shortcuts));
      setChannels(channelList);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const reload = () => {
      load();
    };
    window.addEventListener("catodo:config_changed", reload);
    return () => window.removeEventListener("catodo:config_changed", reload);
  }, [load]);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        setError(null);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) {
        setError("Usá Alt + letra/número/F1–F12 (sin Tab, Esc ni Enter).");
        return;
      }
      setError(null);
      if (capturing === "jump") {
        if (shortcuts.some((shortcut) => normalizeCombo(shortcut.combo) === combo)) {
          setError("Ese combo ya está usado por un atajo personalizado.");
          return;
        }
        setSaving(true);
        api
          .setConfig({ channel_jump_combo: combo })
          .then(() => {
            setJumpCombo(combo);
            setCapturing(null);
          })
          .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
          .finally(() => setSaving(false));
      } else {
        setDraftCombo(combo);
        setCapturing(null);
      }
    };
    (window as unknown as { __catodoCapturingShortcut?: boolean }).__catodoCapturingShortcut = true;
    window.addEventListener("keydown", onKey, true);
    return () => {
      (window as unknown as { __catodoCapturingShortcut?: boolean }).__catodoCapturingShortcut = false;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [capturing, shortcuts]);

  const saveCustom = async () => {
    const combo = draftCombo;
    if (!combo) {
      setError("Capturá una combinación para el atajo.");
      return;
    }
    if (combo === jumpCombo) {
      setError("Ese combo es el prefijo del salto de canal.");
      return;
    }
    if (shortcuts.some((shortcut) => normalizeCombo(shortcut.combo) === combo)) {
      setError("Ese combo ya está usado.");
      return;
    }
    if (draftAction === "channel" && !draftChannel) {
      setError("Elegí el canal para el atajo.");
      return;
    }
    const entry: CustomShortcut = {
      combo,
      action: draftAction,
      ...(draftAction === "channel" ? { channel: draftChannel } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const next = [...shortcuts, entry];
      await api.setConfig({ shortcuts: next });
      setShortcuts(next);
      setDraftCombo("");
      setDraftAction("channel");
      setDraftChannel("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const removeCustom = async (combo: string) => {
    setSaving(true);
    setError(null);
    try {
      const next = shortcuts.filter((shortcut) => shortcut.combo !== combo);
      await api.setConfig({ shortcuts: next });
      setShortcuts(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={sectionLabel}>SALTO DE CANAL</div>
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Prefijo + número</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Ej. {jumpCombo}, 1, 1 → canal 11
          </div>
        </div>
        <button
          type="button"
          style={{ ...buttonStyle, borderColor: capturing === "jump" ? "var(--accent)" : "var(--border)" }}
          disabled={saving}
          onClick={() => {
            setCapturing("jump");
            setError(null);
          }}
        >
          {capturing === "jump" ? "PRESIONÁ ALT + TECLA…" : jumpCombo}
        </button>
      </div>
      <div style={noteStyle}>
        Después del prefijo, escribí el número y esperá un instante o presioná
        Enter. Escape cancela.
      </div>

      <div style={sectionLabel}>ATAJOS PERSONALIZADOS ({shortcuts.length})</div>
      {shortcuts.length === 0 && (
        <div style={{ ...noteStyle, opacity: 0.6 }}>Sin atajos personalizados.</div>
      )}
      {shortcuts.map((shortcut) => (
        <div key={shortcut.combo} style={{ ...rowStyle, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {shortcut.combo}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
              {actionLabel(shortcut, channels)}
            </div>
          </div>
          <button
            type="button"
            style={{ ...buttonStyle, color: "var(--danger)" }}
            disabled={saving}
            onClick={() => removeCustom(shortcut.combo)}
          >
            BORRAR
          </button>
        </div>
      ))}

      <div style={{ ...rowStyle, flexWrap: "wrap", gap: 6 }}>
        <select
          style={inputStyle}
          value={draftAction}
          onChange={(event) => setDraftAction(event.target.value as ShortcutAction)}
        >
          {ACTIONS.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </select>
        {draftAction === "channel" && (
          <select
            style={inputStyle}
            value={draftChannel}
            onChange={(event) => setDraftChannel(event.target.value)}
          >
            <option value="">Elegí un canal…</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          style={{ ...buttonStyle, borderColor: capturing === "custom" ? "var(--accent)" : "var(--border)" }}
          disabled={saving}
          onClick={() => {
            setCapturing("custom");
            setError(null);
          }}
        >
          {capturing === "custom" ? "PRESIONÁ ALT + TECLA…" : draftCombo || "CAPTURAR COMBO"}
        </button>
        <button
          type="button"
          style={{ ...buttonStyle, borderColor: "var(--accent)" }}
          disabled={saving}
          onClick={saveCustom}
        >
          AÑADIR
        </button>
      </div>

      <div style={sectionLabel}>ATAJOS FIJOS</div>
      <div style={noteStyle}>
        Tab menú de canales · F11 pantalla completa · Esc Home · + / − volumen ·
        ↑ / ↓ volumen (salvo IPTV). Los números directos están desactivados para
        no chocar con formularios de los canales.
      </div>

      {error && (
        <div
          role="alert"
          style={{
            margin: "6px 8px",
            padding: "6px 8px",
            fontSize: 10,
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {error}
        </div>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}
