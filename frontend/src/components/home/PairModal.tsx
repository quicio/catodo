import type { HomeSlotProps } from "./types";

/**
 * Modal fullscreen de "Conectar tu teléfono": backdrop + card con QR,
 * código de emparejamiento y URL.
 *
 * Se muestra cuando `homeState.showPair`.
 */
export function PairModal({ homeState }: HomeSlotProps) {
  const { showPair, pairInfo, closePair } = homeState;

  if (!showPair) return null;

  return (
    <div
      onClick={closePair}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--bg) 80%, transparent)",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--text)",
          color: "var(--bg)",
          borderRadius: "var(--radius-lg)",
          padding: 28,
          width: 320,
          textAlign: "center",
          fontFamily: "var(--font-mono)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Conectar tu teléfono
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 16 }}>
          Escaneá con la cámara del iPhone (o escribí el código)
        </div>
        {pairInfo && (
          <>
            <img
              src="/api/pair/qr"
              alt="QR"
              width={220}
              height={220}
              style={{ display: "block", margin: "0 auto 14px", borderRadius: "var(--radius-sm)" }}
            />
            {pairInfo.code && (
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 6, marginBottom: 8 }}>
                {pairInfo.code}
              </div>
            )}
            <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all" }}>
              {pairInfo.url}
            </div>
          </>
        )}
        <button
          onClick={closePair}
          style={{
            marginTop: 16,
            padding: "10px 20px",
            border: "none",
            borderRadius: "var(--radius-md)",
            background: "var(--bg)",
            color: "var(--text)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
