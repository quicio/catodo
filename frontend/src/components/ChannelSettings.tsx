import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, type ChannelInfo, type PluginInfo } from "../api/client";

const sectionLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "12px 8px 4px",
  fontFamily: "var(--font-mono)",
};

const cardStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const badgeStyle: CSSProperties = {
  fontSize: 9,
  letterSpacing: 1,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  color: "var(--text-dim)",
  textTransform: "uppercase",
};

const actionStyle: CSSProperties = {
  padding: "4px 8px",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  background: "transparent",
  color: "var(--text-dim)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "5px 8px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text)",
  background: "color-mix(in srgb, var(--text) 4%, transparent)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Badge({ children }: { children: string }) {
  return <span style={badgeStyle}>{children}</span>;
}

function urlKey(id: string): string {
  return `channel_${id}_url`;
}

export default function ChannelSettings() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [catalog, setCatalog] = useState<PluginInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [iptv, setIptv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [installed, catalogEntries, available, cfg] = await Promise.all([
        api.plugins(),
        api.catalog(),
        api.channels(),
        api.config(),
      ]);
      setPlugins(installed);
      setCatalog(catalogEntries);
      setChannels(available);
      const nextUrls: Record<string, string> = {};
      for (const channel of available) {
        if (channel.type === "web") {
          nextUrls[channel.id] = String(cfg[urlKey(channel.id)] ?? "");
        }
      }
      // Plugins deshabilitados no están en /api/channels pero igual se editan.
      for (const plugin of installed) {
        if (plugin.type === "web" && nextUrls[plugin.id] === undefined) {
          nextUrls[plugin.id] = String(cfg[urlKey(plugin.id)] ?? "");
        }
      }
      setUrls(nextUrls);
      setIptv(String(cfg.iptv_playlist ?? ""));
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const reload = () => {
      refresh();
    };
    window.addEventListener("catodo:plugins_changed", reload);
    window.addEventListener("catodo:config_changed", reload);
    return () => {
      window.removeEventListener("catodo:plugins_changed", reload);
      window.removeEventListener("catodo:config_changed", reload);
    };
  }, [refresh]);

  const pluginById = useMemo(
    () => new Map(plugins.map((plugin) => [plugin.id, plugin])),
    [plugins],
  );
  // Canales visibles + plugins deshabilitados (no están en /api/channels).
  const rows = useMemo(() => {
    const pluginIds = new Set(plugins.map((plugin) => plugin.id));
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    const list: {
      id: string;
      name: string;
      type: string;
      order: number;
    }[] = [];
    for (const channel of channels) {
      if (!pluginIds.has(channel.id)) {
        list.push({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          order: channel.order ?? 9999,
        });
      }
    }
    for (const plugin of plugins) {
      const channel = channelById.get(plugin.id);
      list.push({
        id: plugin.id,
        name: channel?.name ?? plugin.name,
        type: channel?.type ?? plugin.type,
        order: channel?.order ?? plugin.order ?? 9999,
      });
    }
    return list.sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name),
    );
  }, [channels, plugins]);
  const available = useMemo(
    () => catalog.filter((entry) => !entry.installed),
    [catalog],
  );
  const hasDrm = useMemo(
    () => catalog.some((entry) => entry.drm),
    [catalog],
  );

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const move = (id: string, delta: -1 | 1) => {
    const index = rows.findIndex((row) => row.id === id);
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= rows.length) return;
    const neighbor = rows[targetIndex];
    const order = delta < 0 ? neighbor.order - 1 : neighbor.order + 1;
    run(`move-${id}`, () => api.setPluginOrder(id, order));
  };

  return (
    <div>
      <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-dim)" }}>
        Instalá canales del catálogo, habilitá o deshabilitá los existentes y
        ajustá su URL, playlist u orden.
      </div>
      {hasDrm && (
        <div
          style={{
            margin: "8px",
            padding: "8px 10px",
            fontSize: 10,
            lineHeight: 1.5,
            color: "var(--text-dim)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "color-mix(in srgb, var(--text) 4%, transparent)",
          }}
        >
          Los canales marcados <Badge>Widevine</Badge> usan DRM. La reproducción
          depende del runtime ECS con Widevine y de lo que permita cada
          proveedor con tu cuenta.
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            margin: "8px",
            padding: "8px 10px",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--danger)",
            border: "1px solid color-mix(in srgb, var(--danger) 45%, transparent)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {error}
        </div>
      )}

      <div style={sectionLabel}>CANALES ({rows.length})</div>
      {rows.map((row) => {
        const plugin = pluginById.get(row.id);
        const isNative = !plugin;
        return (
          <div key={row.id} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{row.name}</span>
              <Badge>{row.type}</Badge>
              {isNative ? (
                <Badge>nativo</Badge>
              ) : (
                <>
                  <Badge>{plugin.origin}</Badge>
                  {plugin.drm && <Badge>Widevine</Badge>}
                  <Badge>{plugin.enabled ? "activo" : "inactivo"}</Badge>
                </>
              )}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {row.id}
              </span>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!isNative && (
                <>
                  <button
                    type="button"
                    style={actionStyle}
                    disabled={busy !== null}
                    onClick={() =>
                      run(`toggle-${row.id}`, () =>
                        api.setPluginEnabled(row.id, !plugin.enabled),
                      )
                    }
                  >
                    {plugin.enabled ? "Deshabilitar" : "Habilitar"}
                  </button>
                  {!plugin.bundled && (
                    <button
                      type="button"
                      style={{ ...actionStyle, color: "var(--danger)" }}
                      disabled={busy !== null}
                      onClick={() =>
                        run(`uninstall-${row.id}`, () =>
                          api.uninstallPlugin(row.id),
                        )
                      }
                    >
                      Desinstalar
                    </button>
                  )}
                  <button
                    type="button"
                    style={actionStyle}
                    disabled={busy !== null}
                    onClick={() => move(row.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    style={actionStyle}
                    disabled={busy !== null}
                    onClick={() => move(row.id, 1)}
                  >
                    ↓
                  </button>
                </>
              )}
            </div>

            {row.type === "web" && !isNative && (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  aria-label={`URL de ${row.name}`}
                  style={inputStyle}
                  value={urls[row.id] ?? ""}
                  placeholder={plugin?.url ?? "https://…"}
                  onChange={(event) =>
                    setUrls((current) => ({
                      ...current,
                      [row.id]: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  style={actionStyle}
                  disabled={busy !== null}
                  onClick={() =>
                    run(`url-${row.id}`, () =>
                      api.setConfig({ [urlKey(row.id)]: urls[row.id] ?? "" }),
                    )
                  }
                >
                  Guardar
                </button>
              </div>
            )}

            {row.id === "iptv" && (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  aria-label="Playlist IPTV (M3U)"
                  style={inputStyle}
                  value={iptv}
                  placeholder="/ruta/a/lista.m3u o https://…"
                  onChange={(event) => setIptv(event.target.value)}
                />
                <button
                  type="button"
                  style={actionStyle}
                  disabled={busy !== null}
                  onClick={() =>
                    run("iptv-playlist", () =>
                      api.setConfig({ iptv_playlist: iptv }),
                    )
                  }
                >
                  Guardar
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div style={sectionLabel}>CATÁLOGO ({available.length})</div>
      {available.length === 0 ? (
        <div style={{ padding: "6px 10px", fontSize: 11, opacity: 0.6 }}>
          No hay canales disponibles sin instalar.
        </div>
      ) : (
        available.map((entry) => (
          <div key={entry.id} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</span>
              <Badge>{entry.type}</Badge>
              {entry.drm && <Badge>Widevine</Badge>}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                v{entry.available_version ?? entry.version}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 10,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.url}
              </span>
              <button
                type="button"
                style={actionStyle}
                disabled={busy !== null}
                onClick={() =>
                  run(`install-${entry.id}`, () => api.installPlugin(entry.id))
                }
              >
                Instalar
              </button>
            </div>
          </div>
        ))
      )}
      <div style={{ height: 8 }} />
      <div
        style={{
          padding: "4px 8px 10px",
          fontSize: 9,
          color: "var(--text-dim)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {busy ? `Aplicando ${busy}…` : ""}
      </div>
    </div>
  );
}
