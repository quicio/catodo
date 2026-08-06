import type { ChannelInfo } from "../api/client";
import Spotify from "../channels/Spotify";
import YouTube from "../channels/YouTube";
import Anime from "../channels/Anime";
import Tv from "../channels/Tv";

const REGISTRY: Record<string, React.FC> = {
  spotify: Spotify,
  youtube: YouTube,
  anime: Anime,
  tv: Tv,
};

export default function ChannelView({ current }: { current: ChannelInfo | null }) {
  if (!current) {
    return (
      <div className="channel-view placeholder">
        <h1>Cátodo</h1>
        <p>Press 1–6 to switch channels.</p>
      </div>
    );
  }
  const View = REGISTRY[current.id];
  if (!View) {
    return (
      <div className="channel-view placeholder">
        <h1>{current.name}</h1>
        <p>No view registered.</p>
      </div>
    );
  }
  return (
    <div className="channel-view">
      <View />
    </div>
  );
}
