
/**
 * Título de la app ("Cátodo") + subtítulo ("SELECCIONÁ UN CANAL").
 */
export function Brand() {
  return (
    <div
      style={{
        textAlign: "center",
        position: "relative",
        zIndex: 2,
        fontFamily: "var(--font-display)",
      }}
    >
      <div
        style={{
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: -3,
          textShadow: "0 0 40px rgba(255,255,255,0.3)",
          lineHeight: 1,
        }}
      >
        Cátodo
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 14,
          opacity: 0.55,
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        SELECCIONÁ UN CANAL
      </div>
    </div>
  );
}
