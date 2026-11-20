import { useEffect, useState } from "react";
import type { ChannelInfo } from "../../api/client";
import { Icon, type IconName } from "../../icons";
import type { HomeSlotProps } from "./types";

const CHANNEL_ICONS: Record<string, IconName> = {
  spotify: "music",
  youtube: "monitor-play",
  anime: "clapperboard",
  tv: "tv",
  crunchyroll: "play",
  arcade: "gamepad",
};

const VALID_ICONS = new Set<string>([
  "music",
  "monitor-play",
  "clapperboard",
  "tv",
  "play",
  "pause",
  "skip-back",
  "skip-forward",
  "gamepad",
  "thumbs-up",
  "thumbs-down",
  "check",
  "x",
  "settings",
  "smartphone",
]);

const COLORS: Record<string, string> = {
  spotify: "var(--ch-spotify)",
  youtube: "var(--ch-youtube)",
  anime: "var(--ch-anime)",
  tv: "var(--ch-tv)",
  crunchyroll: "var(--ch-crunchyroll)",
  arcade: "var(--ch-arcade)",
};

/** Filas visibles por página. Las columnas salen del breakpoint (4/3/2). */
const PAGE_ROWS = 3;

function columnsForViewport(): number {
  if (window.matchMedia("(max-width: 640px)").matches) return 2;
  if (window.matchMedia("(max-width: 900px)").matches) return 3;
  return 4;
}

/**
 * Columnas efectivas de la grilla, sincronizadas con los `@media` de
 * styles.css. La página se arma como `columnas × 3 filas` para que nunca
 * quede una fila colgando fuera de la pantalla.
 */
function useGridColumns(): number {
  const [columns, setColumns] = useState(columnsForViewport);
  useEffect(() => {
    const queries = [
      window.matchMedia("(max-width: 640px)"),
      window.matchMedia("(max-width: 900px)"),
    ];
    const update = () => setColumns(columnsForViewport());
    queries.forEach((query) => query.addEventListener("change", update));
    return () => queries.forEach((query) => query.removeEventListener("change", update));
  }, []);
  return columns;
}

/**
 * Grilla de canales con cards hover/morph. Cada card muestra ícono, nombre
 * y CH NN. El `hovered` es estado local (no se comparte).
 *
 * Con más canales que una página (12 en desktop) aparece el paginador:
 * números de canal y atajos Alt+C + N siguen siendo globales.
 */
export function ChannelGrid({ channels, onPick }: Pick<HomeSlotProps, "channels" | "onPick">) {
  const [hovered, setHovered] = useState<string | null>(null);
  const columns = useGridColumns();
  const pageSize = columns * PAGE_ROWS;
  const pageCount = Math.max(1, Math.ceil(channels.length / pageSize));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visible = channels.slice(start, start + pageSize);

  const goTo = (next: number) => {
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
    setHovered(null);
  };

  return (
    <div className={`home-channels${pageCount > 1 ? " is-paged" : ""}`}>
      <div className="home-grid">
        {visible.map((c: ChannelInfo, i) => {
          const order = start + i;
          const iconName = (VALID_ICONS.has(c.icon)
            ? c.icon
            : CHANNEL_ICONS[c.id] || (c.type === "web" ? "monitor-play" : "tv")) as IconName;
          const color = c.color || COLORS[c.id] || "var(--text)";
          const isHover = hovered === c.id;
          const tint = (percent: number) =>
            `color-mix(in srgb, ${color} ${percent}%, transparent)`;
          return (
            <button
              key={c.id}
              type="button"
              aria-label={`Abrir ${c.name}, canal ${order + 1}`}
              className="home-card"
              onClick={() => onPick(c.id)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(c.id)}
              onBlur={() => setHovered(null)}
              style={{
                background: isHover
                  ? "color-mix(in srgb, var(--text) 8%, transparent)"
                  : "color-mix(in srgb, var(--text) 4%, transparent)",
                border: `1px solid ${isHover ? tint(45) : "color-mix(in srgb, var(--text) 10%, transparent)"}`,
                transform: isHover ? "translateY(-6px)" : "translateY(0)",
                transition: "transform 0.15s ease, background 0.15s ease, border 0.15s ease",
              }}
            >
              <div
                className="home-card-icon"
                style={{
                  background: tint(18),
                  color,
                  border: `1px solid ${tint(45)}`,
                  boxShadow: `0 0 18px ${tint(28)}`,
                }}
              >
                <Icon
                  name={iconName}
                  morphTo={isHover ? "play" : undefined}
                  size={26}
                  strokeWidth={2}
                  color={color}
                />
              </div>
              <div className="home-card-name">{c.name}</div>
              <div className="home-card-ch">CH {String(order + 1).padStart(2, "0")}</div>
            </button>
          );
        })}

        {/* Slots vacíos: mantienen las 3 filas (y el paginador en su lugar)
            cuando la última página no está completa. */}
        {pageCount > 1 &&
          Array.from({ length: pageSize - visible.length }, (_, i) => (
            <div
              key={`placeholder-${i}`}
              className="home-card home-card-placeholder"
              aria-hidden="true"
            >
              <div className="home-card-icon" />
              <div className="home-card-name">—</div>
              <div className="home-card-ch">CH 00</div>
            </div>
          ))}
      </div>

      {pageCount > 1 && (
        <nav className="home-pager" aria-label="Páginas de canales">
          <button
            type="button"
            className="home-pager-btn"
            onClick={() => goTo(safePage - 1)}
            disabled={safePage === 0}
            aria-label="Página anterior de canales"
          >
            ANTERIOR
          </button>
          <span className="home-pager-label" aria-live="polite">
            {String(safePage + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}
          </span>
          <button
            type="button"
            className="home-pager-btn"
            onClick={() => goTo(safePage + 1)}
            disabled={safePage === pageCount - 1}
            aria-label="Página siguiente de canales"
          >
            SIGUIENTE
          </button>
        </nav>
      )}
    </div>
  );
}
