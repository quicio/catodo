import type { ChannelInfo } from "../api/client";

export default function ChannelBar({
  channels,
  current,
  visible,
  onPick,
}: {
  channels: ChannelInfo[];
  current: string | null;
  visible: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className={`channel-bar ${visible ? "" : "hidden"}`}>
      <span className="channel-bar-label">CATODO</span>
      {channels.map((c, i) => (
        <button
          key={c.id}
          className={`channel-pill ${c.id === current ? "active" : ""}`}
          onClick={() => onPick(c.id)}
        >
          <span className="channel-pill-num">{String(i + 1).padStart(2, "0")}</span>
          {c.name}
        </button>
      ))}
    </div>
  );
}
