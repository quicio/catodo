/**
 * Settings section: Public domain + tunnel.
 *
 * Polls /api/tunnel/health every 5 s while the section is mounted so the
 * status indicator reflects reachability/latency in real time. Hidden until
 * the user opts in (we don't want to show this to LAN-only users).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";

interface TunnelProvider {
  name: string;
  configured: boolean;
  reason?: string;
}

interface TunnelStatus {
  state: "stopped" | "starting" | "running" | "failed" | "degraded";
  provider: string;
  pid?: number | null;
  started_at?: number | null;
  last_error?: string | null;
}

interface PairInfo {
  lan: string;
  public: string | null;
  primary: "lan" | "public";
  code: string;
}

interface HealthInfo {
  reachable: boolean;
  latency_ms?: number;
  last_error?: string;
  last_ok?: string | null;
  reason?: string;
}

const POLL_MS = 5_000;

export function TunnelSection({ enabled }: { enabled: boolean }) {
  const [providers, setProviders] = useState<TunnelProvider[]>([]);
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [pair, setPair] = useState<PairInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState({
    public_domain: "",
    tunnel_enabled: false,
    tunnel_provider: "cloudflare",
    tunnel_token_path: "",
    tunnel_require_token: true,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [cfgR, provR, statR, pairR] = await Promise.all([
          api.config(),
          fetch("/api/tunnel/providers").then((r) => r.json()).catch(() => []),
          fetch("/api/tunnel/status").then((r) => r.json()).catch(() => null),
          fetch("/api/pair/info").then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        setCfg((prev) => ({
          public_domain: (cfgR.public_domain as string) ?? prev.public_domain,
          tunnel_enabled: (cfgR.tunnel_enabled as boolean) ?? prev.tunnel_enabled,
          tunnel_provider: (cfgR.tunnel_provider as string) ?? prev.tunnel_provider,
          tunnel_token_path: (cfgR.tunnel_token_path as string) ?? prev.tunnel_token_path,
          tunnel_require_token: (cfgR.tunnel_require_token as boolean) ?? prev.tunnel_require_token,
        }));
        setProviders(provR);
        setStatus(statR);
        setPair(pairR);
        if (statR?.state === "running") {
          const h = await fetch("/api/tunnel/health").then((r) => r.json()).catch(() => null);
          if (!cancelled) setHealth(h);
        } else {
          setHealth({ reachable: false, reason: "stopped" });
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? e));
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.setConfig(cfg);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      await save();
      const r = await fetch("/api/tunnel/start", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/tunnel/stop", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const stateBadge = useMemo(() => {
    const s = status?.state ?? "stopped";
    const colors: Record<string, string> = {
      stopped: "#888",
      starting: "#f0a020",
      running: health?.reachable ? "#1db954" : "#f0a020",
      degraded: "#f0a020",
      failed: "#e04040",
    };
    return { label: s, color: colors[s] ?? "#888" };
  }, [status, health]);

  if (!enabled) return null;

  return (
    <div style={{ padding: "6px 10px 10px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: stateBadge.color,
          }}
        />
        <span style={{ color: "var(--text)" }}>{stateBadge.label}</span>
        {health?.latency_ms != null && (
          <span style={{ opacity: 0.7 }}>{health.latency_ms} ms</span>
        )}
      </div>

      <label style={{ display: "block", marginBottom: 6 }}>
        Dominio público
        <input
          type="text"
          placeholder="catodo.example.com"
          value={cfg.public_domain}
          onChange={(e) => setCfg({ ...cfg, public_domain: e.target.value.toLowerCase() })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block", marginBottom: 6 }}>
        Provider
        <select
          value={cfg.tunnel_provider}
          onChange={(e) => setCfg({ ...cfg, tunnel_provider: e.target.value })}
          style={inputStyle}
        >
          {providers.length === 0 && <option value="cloudflare">cloudflare</option>}
          {providers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.configured ? "" : ` (${p.reason ?? "no configurado"})`}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginBottom: 6 }}>
        Ruta del token
        <div style={{ display: "flex", gap: 4 }}>
          <input
            ref={fileRef}
            type="text"
            placeholder="/home/me/.cloudflared/<id>.json"
            value={cfg.tunnel_token_path}
            onChange={(e) => setCfg({ ...cfg, tunnel_token_path: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={async () => {
              // browsers cannot set absolute paths via file input — we let
              // the user paste the path manually. This button is just a hint.
              fileRef.current?.focus();
            }}
            style={miniBtn}
          >
            …
          </button>
        </div>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={cfg.tunnel_enabled}
          onChange={(e) => setCfg({ ...cfg, tunnel_enabled: e.target.checked })}
        />
        Habilitar túnel al arrancar
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={cfg.tunnel_require_token}
          onChange={(e) => setCfg({ ...cfg, tunnel_require_token: e.target.checked })}
        />
        Exigir token en /api/* (recomendado)
      </label>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {status?.state === "running" ? (
          <button onClick={stop} disabled={busy} style={btn}>
            Detener
          </button>
        ) : (
          <button onClick={start} disabled={busy} style={btn}>
            Iniciar
          </button>
        )}
        <button onClick={save} disabled={busy} style={btn}>
          Guardar
        </button>
        {pair?.public && (
          <button
            onClick={() => navigator.clipboard.writeText(pair.public!)}
            style={btn}
          >
            Copiar URL pública
          </button>
        )}
      </div>

      {err && (
        <div style={{ marginTop: 6, color: "#e04040", fontSize: 11 }}>{err}</div>
      )}

      {pair?.public && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7, wordBreak: "break-all" }}>
          {pair.public}
        </div>
      )}

      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>
        Una vez creado el tunnel en Cloudflare y apuntado el CNAME{" "}
        <code>{cfg.public_domain || "tu-dominio"}</code> al tunnel, tildá
        &quot;Habilitar&quot; y dale Iniciar.
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 2,
  padding: "6px 8px",
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

const btn: React.CSSProperties = {
  padding: "6px 10px",
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

const miniBtn: React.CSSProperties = {
  ...btn,
  padding: "6px 10px",
};
