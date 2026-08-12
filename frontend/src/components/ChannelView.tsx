import type { AppState, ChannelInfo } from "../api/client";
import Spotify from "../channels/Spotify";
import MediaChannel from "../channels/MediaChannel";
import WebChannel from "../channels/WebChannel";
import ScreenCastView from "../channels/ScreenCastView";
import ArcadeLauncher from "../channels/ArcadeLauncher";

const REGISTRY: Record<string, React.FC<{ volume: number; state: AppState }>> = {
  spotify: Spotify,
};

export default function ChannelView({ current, volume, state }: { current: ChannelInfo | null; volume: number; state: AppState }) {
  if (!current) {
    return (
      <div className="channel-view placeholder">
        <h1>Cátodo</h1>
        <p>Press 1&ndash;4 to switch channels.</p>
      </div>
    );
  }
  if (current.type === "web") {
    return (
      <div className="channel-view">
        <WebChannel channelId={current.id} />
      </div>
    );
  }
  if (current.type === "app") {
    return (
      <div className="channel-view">
        <MediaChannel channelId={current.id} volume={volume} />
      </div>
    );
  }
  if (current.type === "cast") {
    return (
      <div className="channel-view">
        <ScreenCastView />
      </div>
    );
  }
  if (current.type === "launcher") {
    return (
      <div className="channel-view">
        <ArcadeLauncher state={state} />
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
      <View volume={volume} state={state} />
    </div>
  );
}
