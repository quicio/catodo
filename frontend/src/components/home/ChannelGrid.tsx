import { useState } from "react";
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

const COLORS: Record<string, string> = {
  spotify: "var(--ch-spotify)",
  youtube: "var(--ch-youtube)",
  anime: "var(--ch-anime)",
  tv: "var(--ch-tv)",
  crunchyroll: "var(--ch-crunchyroll)",
  arcade: "var(--ch-arcade)",
};

/**
 * Grilla de canales con cards hover/morph. Cada card muestra ícono, nombre
 * y CH NN. El `hovered` es estado local (no se comparte).
 */
export function ChannelGrid({ channels, onPick }: Pick<HomeSlotProps, "channels" | "onPick">) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 18,
        width: "min(960px, calc(100vw - 180px))",
        position: "relative",
        zIndex: 2,
      }}
    >
      {channels.map((c: ChannelInfo, i) => {
        const iconName = CHANNEL_ICONS[c.id] || (c.type === "web" ? "monitor-play" : "tv");
        const color = c.color || COLORS[c.id] || "var(--text)";
        const isHover = hovered === c.id;
        const tint = (percent: number) =>
          `color-mix(in srgb, ${color} ${percent}%, transparent)`;
        return (
          <button
            key={c.id}
            type="button"
            aria-label={`Abrir ${c.name}, canal ${i + 1}`}
            onClick={() => onPick(c.id)}
            onMouseEnter={() => setHovered(c.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(c.id)}
            onBlur={() => setHovered(null)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "28px 20px",
              borderRadius: "var(--radius-lg)",
              background: isHover
                ? "color-mix(in srgb, var(--text) 8%, transparent)"
                : "color-mix(in srgb, var(--text) 4%, transparent)",
              border: `1px solid ${isHover ? tint(45) : "color-mix(in srgb, var(--text) 10%, transparent)"}`,
              cursor: "pointer",
              color: "var(--text)",
              transform: isHover ? "translateY(-6px)" : "translateY(0)",
              transition: "transform 0.15s ease, background 0.15s ease, border 0.15s ease",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-dim)",
                letterSpacing: 2,
              }}
            >
              CH {String(i + 1).padStart(2, "0")}
            </div>
          </button>
        );
      })}
    </div>
  );
}
