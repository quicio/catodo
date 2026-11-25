import { useEffect, useRef, type CSSProperties } from "react";
import type { ChannelInfo } from "../api/client";
import { ChannelIcon } from "../channelIcons";

export default function ChannelMenu({
  channels,
  current,
  open,
  index,
  onHover,
  onPick,
  onClose,
}: {
  channels: ChannelInfo[];
  current: string | null;
  open: boolean;
  index: number;
  onHover: (index: number) => void;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const bounded = Math.max(0, Math.min(index, channels.length - 1));
    const item = panelRef.current?.querySelector<HTMLButtonElement>(
      `.channel-menu-item:nth-child(${bounded + 1})`,
    );
    (item ?? panelRef.current)?.focus();
  }, [open, index, channels.length]);

  if (!open) return null;

  return (
    <div className="channel-menu-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="channel-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Canales"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="channel-menu-head">
          <span>CANALES</span>
          <span className="channel-menu-hint">TAB / ESC</span>
        </header>

        <div className="channel-menu-list">
          {channels.length === 0 && (
            <p className="channel-menu-empty">No hay canales disponibles.</p>
          )}
          {channels.map((channel, position) => {
            const color = channel.color || "var(--accent)";
            const focused = position === index;
            const active = channel.id === current;
            return (
              <button
                key={channel.id}
                type="button"
                className={`channel-menu-item${focused ? " is-focused" : ""}${active ? " is-current" : ""}`}
                style={{ "--channel-color": color } as CSSProperties}
                onMouseEnter={() => onHover(position)}
                onFocus={() => onHover(position)}
                onClick={() => onPick(channel.id)}
                aria-current={active ? "true" : undefined}
              >
                <span className="channel-menu-num">
                  {String(position + 1).padStart(2, "0")}
                </span>
                <ChannelIcon
                  channelId={channel.id}
                  icon={channel.icon}
                  channelType={channel.type}
                  size={18}
                  color={color}
                />
                <span className="channel-menu-name">{channel.name}</span>
                {active && <span className="channel-menu-now">AHORA</span>}
              </button>
            );
          })}
        </div>

        <footer className="channel-menu-foot">
          ↑↓ ELEGIR · ENTER ABRIR · TAB CERRAR
        </footer>
      </div>
    </div>
  );
}
