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
    hour12: false,
  });
  const date = now.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dateLabel = date.charAt(0).toUpperCase() + date.slice(1);

  return (
    <div className="home-clock">
      <div className="home-clock-time">{time}</div>
      <div className="home-clock-date">{dateLabel}</div>
    </div>
  );
}
