import type { HomeSlotProps } from "./types";

/**
 * Modal fullscreen de "Conectar tu teléfono": backdrop + card con QR,
 * código de emparejamiento y URL.
 *
 * Se muestra cuando `homeState.showPair`.
 *
 * El QR codifica la URL **primary** (pública si el túnel está corriendo,
 * si no LAN). El texto que se muestra abajo del QR SIEMPRE es la URL que
 * efectivamente codifica el QR — no la LAN legacy — para no engañar al
 * usuario. Si ambas están disponibles, se listan las dos.
 */
export function PairModal({ homeState }: HomeSlotProps) {
  const { showPair, pairInfo, closePair } = homeState;

  if (!showPair) return null;

  const primary: "lan" | "public" = pairInfo?.primary ?? "lan";
  const lanUrl = pairInfo?.lan ?? pairInfo?.url;
  const publicUrl = pairInfo?.public;
  const qrUrl = primary === "public" ? publicUrl : lanUrl;

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

            {/* URL que efectivamente codifica el QR (no la LAN legacy). */}
            <div
              style={{
                fontSize: 9,
                opacity: 0.5,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 2,
              }}
            >
              {primary === "public" ? "Túnel público" : "Red local"}
            </div>
            <div style={{ fontSize: 10, opacity: 0.85, wordBreak: "break-all", marginBottom: 10 }}>
              {qrUrl}
            </div>

            {/* Cuando hay AMBAS, listar la alternativa para que el usuario
                sepa cuál es cuál y pueda copiar la otra si quiere. */}
            {publicUrl && lanUrl && publicUrl !== lanUrl && (
              <div style={{ fontSize: 9, opacity: 0.55, wordBreak: "break-all" }}>
                LAN: {lanUrl}
              </div>
            )}
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
