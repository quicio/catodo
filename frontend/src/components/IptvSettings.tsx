import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { api, type IptvState } from "../api/client";

const sectionLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.6,
  padding: "12px 8px 4px",
  fontFamily: "var(--font-mono)",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "6px 8px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text)",
  background: "color-mix(in srgb, var(--text) 4%, transparent)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
};

const buttonStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 10.5,
  fontFamily: "var(--font-mono)",
  background: "transparent",
  color: "var(--text-dim)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  color: "var(--text)",
  borderColor: "var(--accent)",
  background: "color-mix(in srgb, var(--accent) 16%, transparent)",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function IptvSettings() {
  const [source, setSource] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [state, setState] = useState<IptvState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const config = await api.config();
      const nextSource = String(config.iptv_playlist ?? "");
      setSource(nextSource);
      setSavedSource(nextSource);
      const next = await api.iptvState().catch(() => null);
      setState(next);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === "iptv_playlist") refresh();
    };
    const onHealth = () => refresh();
    window.addEventListener("catodo:config_changed", onChange as EventListener);
    window.addEventListener("catodo:iptv_health_changed", onHealth);
    return () => {
      window.removeEventListener("catodo:config_changed", onChange as EventListener);
      window.removeEventListener("catodo:iptv_health_changed", onHealth);
    };
  }, [refresh]);

  // Mientras el backend verifica en background, refrescamos el progreso.
  useEffect(() => {
    if (!state?.health?.checking) return;
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [state?.health?.checking, refresh]);

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, reloadPlaylist = true) => {
      setBusy(key);
      setError(null);
      try {
        await action();
        if (reloadPlaylist) await api.command("iptv", "refresh");
        await refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const saveSource = () =>
    run("source", () => api.setConfig({ iptv_playlist: source.trim() }));

  const upload = () => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("La lista supera el máximo de 10 MB.");
      return;
    }
    run("upload", async () => {
      const text = await file.text();
      await api.uploadIptvPlaylist(text);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    });
  };

  const clear = () => run("clear", () => api.clearIptvPlaylist());
  const reload = () => run("reload", () => Promise.resolve());
  const verify = () => run("verify", () => api.command("iptv", "check"), false);

  const configured = state?.configured ?? false;
  const isRemote = /^https?:\/\//i.test(savedSource);
  const sourceLabel = configured ? (isRemote ? "URL remota" : "Archivo local") : "Sin lista";

  return (
    <div>
      <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-dim)" }}>
        Cargá una lista M3U/M3U8 para el canal IPTV. Podés subir un archivo o
        apuntar a una URL.
      </div>

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

      <div style={sectionLabel}>ESTADO</div>
      <div
        style={{
          margin: "0 10px 8px",
          padding: "8px 10px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          background: "color-mix(in srgb, var(--text) 3%, transparent)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text)" }}>{sourceLabel}</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {configured
              ? `${state?.health?.available ?? state?.count ?? 0} de ${state?.count ?? 0} canales · ${state?.groups.length ?? 0} grupos`
              : "sin canales"}
          </span>
        </div>
        {configured && savedSource && (
          <div
            title={savedSource}
            style={{
              marginTop: 6,
              fontSize: 9,
              color: "var(--text-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {savedSource}
          </div>
        )}
        {state?.error && (
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--danger)" }}>
            {state.error}
          </div>
        )}
        {configured && state?.health && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color:
                state.health.unavailable > 0 && !state.health.checking
                  ? "var(--danger)"
                  : "var(--text-dim)",
            }}
          >
            {state.health.checking
              ? `Verificando ${state.health.checked}/${state.health.total}…`
              : state.health.checked_at != null
                ? `${state.health.available} disponibles · ${state.health.unavailable} caídos`
                : "Sin verificar"}
          </div>
        )}
        {configured && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              style={buttonStyle}
              disabled={busy !== null || state?.health?.checking}
              onClick={verify}
            >
              {state?.health?.checking ? "Verificando…" : "Verificar canales"}
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={busy !== null}
              onClick={reload}
            >
              {busy === "reload" ? "Recargando…" : "Recargar"}
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, color: "var(--danger)" }}
              disabled={busy !== null}
              onClick={clear}
            >
              {busy === "clear" ? "Quitando…" : "Quitar lista"}
            </button>
          </div>
        )}
      </div>

      <div style={sectionLabel}>SUBIR ARCHIVO</div>
      <input
        ref={fileInput}
        type="file"
        accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
        style={{ display: "none" }}
        onChange={(event) => {
          setError(null);
          setFile(event.target.files?.[0] ?? null);
        }}
      />
      <div style={{ display: "flex", gap: 6, padding: "0 10px 8px", alignItems: "center" }}>
        <button
          type="button"
          style={{ ...buttonStyle, flex: 1 }}
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          Elegir .m3u / .m3u8
        </button>
        <button
          type="button"
          style={{ ...primaryButtonStyle, flex: 1, opacity: file ? 1 : 0.5 }}
          disabled={busy !== null || !file}
          onClick={upload}
        >
          {busy === "upload" ? "Subiendo…" : "Subir y activar"}
        </button>
      </div>
      <div
        style={{
          padding: "0 12px 8px",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Ningún archivo seleccionado."}
      </div>

      <div style={sectionLabel}>URL O RUTA</div>
      <div style={{ display: "flex", gap: 6, padding: "0 10px 8px" }}>
        <input
          aria-label="Playlist IPTV (M3U)"
          style={inputStyle}
          value={source}
          placeholder="https://… o /ruta/a/lista.m3u"
          onChange={(event) => setSource(event.target.value)}
        />
        <button
          type="button"
          style={primaryButtonStyle}
          disabled={busy !== null}
          onClick={saveSource}
        >
          {busy === "source" ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {state && state.groups.length > 0 && (
        <>
          <div style={sectionLabel}>GRUPOS ({state.groups.length})</div>
          <div
            style={{
              margin: "0 10px 8px",
              maxHeight: 160,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {state.groups.map((group) => (
              <div
                key={group.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.name}
                </span>
                <span style={{ color: "var(--text-dim)" }}>{group.channels.length}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 8 }} />
    </div>
  );
}
