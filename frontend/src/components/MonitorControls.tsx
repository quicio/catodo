import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../api/client";

export type MonitorMode = "css" | "image";

export interface MonitorParams {
  enabled: boolean;
  curvature: number;
  blackBorder: number;
  rounded: boolean;
  mode: MonitorMode;
  imageUrl: string;
  screenLeft: number;
  screenTop: number;
  screenWidth: number;
  screenHeight: number;
}

const BUILTIN_FRAME = "/arcade/vintage-crt.webp";

const DEFAULTS: MonitorParams = {
  enabled: true,
  curvature: 0.07,
  blackBorder: 0,
  rounded: false,
  mode: "css",
  imageUrl: BUILTIN_FRAME,
  screenLeft: 14,
  screenTop: 8.7,
  screenWidth: 68.25,
  screenHeight: 82.4,
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "6px 2px",
};

const labelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 10,
  letterSpacing: 1.5,
  fontFamily: "var(--font-mono)",
  color: "var(--text-dim)",
};

const sliderStyle: CSSProperties = {
  width: "100%",
  accentColor: "var(--accent-soft)",
  cursor: "pointer",
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

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function MonitorControls({
  onChange,
}: {
  onChange?: (params: MonitorParams) => void;
}) {
  const [params, setParams] = useState<MonitorParams>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const saveTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = useCallback((next: MonitorParams) => {
    setParams(next);
    onChangeRef.current?.(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const config = await api.config();
      const mode = config.arcade_monitor_mode === "image" ? "image" : "css";
      apply({
        enabled: config.arcade_monitor_frame !== false,
        curvature: clamp(
          config.arcade_monitor_curvature,
          0,
          0.2,
          DEFAULTS.curvature,
        ),
        blackBorder: clamp(
          config.arcade_monitor_black_border,
          0,
          24,
          DEFAULTS.blackBorder,
        ),
        rounded: config.arcade_monitor_rounded === true,
        mode,
        imageUrl:
          typeof config.arcade_monitor_image === "string" &&
          config.arcade_monitor_image.length > 0
            ? config.arcade_monitor_image
            : BUILTIN_FRAME,
        screenLeft: clamp(
          config.arcade_monitor_screen_left,
          0,
          40,
          DEFAULTS.screenLeft,
        ),
        screenTop: clamp(
          config.arcade_monitor_screen_top,
          0,
          40,
          DEFAULTS.screenTop,
        ),
        screenWidth: clamp(
          config.arcade_monitor_screen_width,
          20,
          95,
          DEFAULTS.screenWidth,
        ),
        screenHeight: clamp(
          config.arcade_monitor_screen_height,
          20,
          98,
          DEFAULTS.screenHeight,
        ),
      });
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChangeConfig = () => {
      load();
    };
    window.addEventListener("catodo:config_changed", onChangeConfig);
    return () => window.removeEventListener("catodo:config_changed", onChangeConfig);
  }, [load]);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const persist = (next: MonitorParams) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api
        .setConfig({
          arcade_monitor_frame: next.enabled,
          arcade_monitor_curvature: next.curvature,
          arcade_monitor_black_border: next.blackBorder,
          arcade_monitor_rounded: next.rounded,
          arcade_monitor_mode: next.mode,
          arcade_monitor_image: next.imageUrl,
          arcade_monitor_screen_left: next.screenLeft,
          arcade_monitor_screen_top: next.screenTop,
          arcade_monitor_screen_width: next.screenWidth,
          arcade_monitor_screen_height: next.screenHeight,
        })
        .then(() => setError(null))
        .catch((cause) => setError(errorText(cause)));
    }, 120);
  };

  const update = (patch: Partial<MonitorParams>) => {
    const next = { ...params, ...patch };
    apply(next);
    persist(next);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen PNG, JPEG o WebP.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const response = await fetch("/api/arcade/frame", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(body?.detail ?? `HTTP ${response.status}`);
      }
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeImage = async () => {
    setUploading(true);
    setError(null);
    try {
      const response = await fetch("/api/arcade/frame", { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={rowStyle}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            borderColor: params.enabled ? "var(--accent-soft)" : "var(--border)",
          }}
          aria-pressed={params.enabled}
          onClick={() => update({ enabled: !params.enabled })}
        >
          MONITOR {params.enabled ? "VISIBLE" : "OCULTO"}
        </button>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>
          <span>ESTILO</span>
          <span>{params.mode === "image" ? "IMAGEN" : "CSS"}</span>
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              ...buttonStyle,
              borderColor:
                params.mode === "css" ? "var(--accent-soft)" : "var(--border)",
            }}
            onClick={() =>
              update({
                mode: "css",
                imageUrl: params.imageUrl || BUILTIN_FRAME,
              })
            }
          >
            CSS
          </button>
          <button
            type="button"
            style={{
              ...buttonStyle,
              borderColor:
                params.mode === "image" && params.imageUrl === BUILTIN_FRAME
                  ? "var(--accent-soft)"
                  : "var(--border)",
            }}
            onClick={() =>
              update({
                mode: "image",
                imageUrl: BUILTIN_FRAME,
                screenLeft: DEFAULTS.screenLeft,
                screenTop: DEFAULTS.screenTop,
                screenWidth: DEFAULTS.screenWidth,
                screenHeight: DEFAULTS.screenHeight,
              })
            }
          >
            VINTAGE
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? "SUBIENDO…" : "SUBIR IMAGEN"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={(event) => upload(event.target.files?.[0])}
          />
        </div>
      </div>

      {params.mode === "image" && (
        <>
          <div style={{ padding: "4px 2px" }}>
            <img
              src={params.imageUrl}
              alt="Frame del monitor"
              style={{
                width: "100%",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                display: "block",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button
                type="button"
                style={buttonStyle}
                disabled={uploading}
                onClick={removeImage}
              >
                QUITAR IMAGEN
              </button>
            </div>
          </div>

          <span style={labelStyle}>
            <span>PANTALLA (CALIBRACIÓN)</span>
            <span>%</span>
          </span>
          <label style={rowStyle}>
            <span style={labelStyle}>
              <span>IZQUIERDA</span>
              <span>{params.screenLeft.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              step={0.1}
              value={params.screenLeft}
              style={sliderStyle}
              onChange={(event) =>
                update({ screenLeft: Number(event.target.value) })
              }
            />
          </label>
          <label style={rowStyle}>
            <span style={labelStyle}>
              <span>ARRIBA</span>
              <span>{params.screenTop.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              step={0.1}
              value={params.screenTop}
              style={sliderStyle}
              onChange={(event) =>
                update({ screenTop: Number(event.target.value) })
              }
            />
          </label>
          <label style={rowStyle}>
            <span style={labelStyle}>
              <span>ANCHO</span>
              <span>{params.screenWidth.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={20}
              max={95}
              step={0.1}
              value={params.screenWidth}
              style={sliderStyle}
              onChange={(event) =>
                update({ screenWidth: Number(event.target.value) })
              }
            />
          </label>
          <label style={rowStyle}>
            <span style={labelStyle}>
              <span>ALTO</span>
              <span>{params.screenHeight.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={20}
              max={98}
              step={0.1}
              value={params.screenHeight}
              style={sliderStyle}
              onChange={(event) =>
                update({ screenHeight: Number(event.target.value) })
              }
            />
          </label>
        </>
      )}

      <label style={rowStyle}>
        <span style={labelStyle}>
          <span>CURVATURA</span>
          <span>{params.curvature.toFixed(3)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={0.2}
          step={0.005}
          value={params.curvature}
          style={sliderStyle}
          onChange={(event) => update({ curvature: Number(event.target.value) })}
        />
      </label>

      <label style={rowStyle}>
        <span style={labelStyle}>
          <span>BORDE NEGRO</span>
          <span>{params.blackBorder}px</span>
        </span>
        <input
          type="range"
          min={0}
          max={24}
          step={1}
          value={params.blackBorder}
          style={sliderStyle}
          onChange={(event) =>
            update({ blackBorder: Number(event.target.value) })
          }
        />
      </label>

      <div style={rowStyle}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            borderColor: params.rounded ? "var(--accent-soft)" : "var(--border)",
          }}
          aria-pressed={params.rounded}
          onClick={() => update({ rounded: !params.rounded })}
        >
          BORDES REDONDEADOS {params.rounded ? "SÍ" : "NO"}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 2px" }}>
        <button type="button" style={buttonStyle} onClick={() => update(DEFAULTS)}>
          RESTABLECER
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "6px 2px",
            fontSize: 10,
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
