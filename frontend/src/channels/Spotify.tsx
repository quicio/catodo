import type { AppState } from "../api/client";
import NowPlaying from "../components/NowPlaying";

export default function Spotify({ volume: _v, state }: { volume: number; state: AppState }) {
  return <NowPlaying state={state} />;
}
