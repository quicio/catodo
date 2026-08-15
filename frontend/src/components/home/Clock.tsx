import type { HomeSlotProps } from "./types";

/**
 * Reloj principal (top-left). Muestra hora grande + fecha formateada en es-AR.
 */
export function Clock({ homeState }: HomeSlotProps) {
  const { now } = homeState;
  const time = now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        left: 40,
        zIndex: 2,
        fontFamily: "var(--font-mono)",
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, letterSpacing: 1 }}>
        {time}
      </div>
      <div style={{ fontSize: 14, opacity: 0.55, marginTop: 6, letterSpacing: 2 }}>
        {date}
      </div>
    </div>
  );
}
