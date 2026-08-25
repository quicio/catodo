/**
 * PWA bootstrap for the /remote page.
 *
 * - Registers the service worker ONLY when the page is served from /remote/.
 *   The Electron kiosko loads / and never registers a SW (we don't want
 *   stale cache breaking deploys).
 * - Surfaces a dismissable "Instalar como app" banner when
 *   `beforeinstallprompt` fires (Chrome/Edge on Android and desktop).
 * - Persists the pairing token in localStorage so a re-opened remote from
 *   the home-screen icon keeps working.
 *
 * Mounts nothing on /, so it is safe to include in the single bundle.
 */
import { useEffect, useState } from "react";

const TOKEN_KEY = "catodo.token";
const INSTALL_DISMISS_KEY = "catodo.install.dismissed";

export function RemotePWAInstaller() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const isRemote = window.location.pathname.startsWith("/remote");
    if (!isRemote) return;
    if (!("serviceWorker" in navigator)) return;

    // Register the SW only on /remote/. The kiosko (/) never gets one.
    navigator.serviceWorker
      .register("/remote/sw.js", { scope: "/remote/" })
      .catch((e) => console.warn("SW register failed", e));

    // Pairing-token bootstrap: prefer URL ?code=…, fall back to localStorage.
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("code");
    if (fromUrl) {
      try {
        localStorage.setItem(TOKEN_KEY, fromUrl);
      } catch {
        /* ignore */
      }
    }

    // Inject the stored token into every API call by monkey-patching fetch.
    injectTokenInterceptor();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!dismissed) setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch {
      /* ignore */
    }
    setInstallPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
    setShowBanner(false);
  };

  if (!showBanner || dismissed) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        right: 12,
        background: "var(--surface, #1a1a1a)",
        color: "var(--text, #f0f0f0)",
        border: "1px solid var(--border, #333)",
        borderRadius: 10,
        padding: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14,
        display: "flex",
        gap: 8,
        alignItems: "center",
        zIndex: 1000,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <span style={{ flex: 1 }}>¿Instalar Cátodo Remote como app?</span>
      <button
        onClick={handleInstall}
        style={{
          background: "var(--accent, #1db954)",
          color: "#000",
          border: "none",
          borderRadius: 6,
          padding: "6px 12px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Instalar
      </button>
      <button
        onClick={handleDismiss}
        style={{
          background: "transparent",
          color: "var(--text-dim, #999)",
          border: "1px solid var(--border, #333)",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        Más tarde
      </button>
    </div>
  );
}

function injectTokenInterceptor() {
  // Wrap window.fetch so every API call carries the X-Catodo-Token header
  // and clears the stored token on 401 (so the UI can show the re-pair hint).
  const w = window as unknown as { __catodoFetchWrapped?: boolean };
  if (w.__catodoFetchWrapped) return;
  w.__catodoFetchWrapped = true;

  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isApi = url.includes("/api/") && !url.includes("/api/health") && !url.includes("/api/pair/info");
    const headers = new Headers(init?.headers || {});
    if (isApi) {
      try {
        const tok = localStorage.getItem(TOKEN_KEY);
        if (tok && !headers.has("X-Catodo-Token")) headers.set("X-Catodo-Token", tok);
      } catch {
        /* ignore */
      }
    }
    const resp = await orig(input as RequestInfo, { ...init, headers });
    if (resp.status === 401 && isApi) {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
    return resp;
  };
}
