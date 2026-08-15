import { useCallback, useEffect, useState } from "react";
import type { AppState } from "../../api/client";
import type { Rating, SharedHomeState } from "./types";

const RATINGS_KEY = "catodo.wallpaper.ratings";
const MIN_VISIBLE = 3;

const wpId = (url: string) => url.split("/").pop()?.split(".")[0] || url;

function loadRatings(): Record<string, Rating> {
  try {
    return JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveRatings(r: Record<string, Rating>) {
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(r));
  } catch {}
}

export function useHomeState(state: AppState): SharedHomeState {
  // Estado compartido entre slots (ver auditoría previa).
  const [ratings, setRatings] = useState<Record<string, Rating>>(loadRatings);
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [wpIndex, setWpIndex] = useState(0);
  const [loadingWp, setLoadingWp] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showPair, setShowPair] = useState(false);
  const [pairInfo, setPairInfo] = useState<{ url?: string; code?: string } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [artistWp, setArtistWp] = useState<string[]>([]);
  const [coverReady, setCoverReady] = useState(false);

  const spotify = state.spotify;
  const showSpotifyBg = spotify?.status === "Playing";

  // Reloj (L77–80 Home original).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pair info (L66–72).
  useEffect(() => {
    if (!showPair) return;
    fetch("/api/pair/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPairInfo(d))
      .catch(() => setPairInfo(null));
  }, [showPair]);

  // Wallpapers del artista cuando suena Spotify (L87–125).
  useEffect(() => {
    if (showSpotifyBg && spotify?.artist) {
      const key = spotify.artist;
      setArtistWp([]);
      setCoverReady(false);
      let cover: string | null = spotify?.art_url ?? null;
      Promise.all([
        fetch(
          `/api/wallpapers/cover?artist=${encodeURIComponent(key)}&track=${encodeURIComponent(spotify.title ?? "")}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.url)
          .catch(() => null),
        fetch(`/api/wallpapers/artist?name=${encodeURIComponent(key)}&n=6`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.wallpapers ?? [])
          .catch(() => []),
      ]).then(([hi, photos]) => {
        if (hi) cover = hi;
        const list = [cover, ...photos].filter(Boolean) as string[];
        if (list.length > 1) {
          setArtistWp(list);
          const img = new Image();
          const reveal = () => {
            const idx = list.findIndex((u) => ratings[wpId(u)] !== "down");
            setWpIndex(idx >= 0 ? idx : 0);
            setCoverReady(true);
          };
          img.onload = reveal;
          img.onerror = reveal;
          img.src = list[0];
        }
      });
    } else {
      setArtistWp([]);
    }
  }, [spotify?.artist, spotify?.status, spotify?.title, showSpotifyBg]);

  // Lista general de wallpapers (L137–139).
  const loadList = useCallback(
    () =>
      fetch("/api/wallpapers/list")
        .then((r) => r.json())
        .then((d: { wallpapers: string[] }) => setWallpapers(d.wallpapers))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Auto-descarga si quedan pocos visibles (L142–151).
  useEffect(() => {
    const visible = wallpapers.filter((u) => ratings[wpId(u)] !== "down").length;
    if (visible < MIN_VISIBLE && !loadingWp && wallpapers.length > 0) {
      setLoadingWp(true);
      fetch("/api/wallpapers/fetch?n=4", { method: "POST" })
        .then(() => loadList())
        .catch(() => {})
        .finally(() => setLoadingWp(false));
    }
  }, [ratings, wallpapers, loadingWp, loadList]);

  // Init wpIndex al primer no-rechazado (L153–158).
  useEffect(() => {
    if (wallpapers.length === 0) return;
    const idx = wallpapers.findIndex((u) => ratings[wpId(u)] !== "down");
    setWpIndex(idx >= 0 ? idx : 0);
  }, [wallpapers]);

  // Rotación cada 12s (L160–175).
  useEffect(() => {
    const id = setInterval(() => {
      setWpIndex((prev) => {
        const activeList = showSpotifyBg && artistWp.length > 0 ? artistWp : wallpapers;
        if (activeList.length === 0) return prev;
        const cur = prev % activeList.length;
        for (let step = 1; step <= activeList.length; step++) {
          const n = (cur + step) % activeList.length;
          if (ratings[wpId(activeList[n])] !== "down") return n;
        }
        return cur;
      });
    }, 12000);
    return () => clearInterval(id);
  }, [ratings, wallpapers, artistWp, showSpotifyBg]);

  // rate handler (L177–205).
  const onRate = useCallback(
    (id: string, r: Rating) => {
      setRatings((prev) => {
        const next = { ...prev };
        if (r === "none") delete next[id];
        else next[id] = r;
        saveRatings(next);
        return next;
      });
      if (r === "down") {
        setTimeout(() => {
          setWpIndex((prev) => {
            const activeList = showSpotifyBg && artistWp.length > 0 ? artistWp : wallpapers;
            const curWp = activeList[prev % activeList.length];
            const curId = curWp ? wpId(curWp) : null;
            if (curId !== id) return prev;
            for (let step = 1; step <= activeList.length; step++) {
              const n = (prev + step) % activeList.length;
              const nId = wpId(activeList[n]);
              if (ratings[nId] !== "down" && nId !== id) return n;
            }
            return prev;
          });
        }, 600);
      }
    },
    [showSpotifyBg, artistWp, wallpapers],
  );

  const toggleConfig = useCallback(() => setShowConfig((s) => !s), []);
  const openPair = useCallback(() => {
    setShowConfig(false);
    setShowPair(true);
  }, []);
  const closePair = useCallback(() => setShowPair(false), []);

  return {
    wallpapers,
    ratings,
    wpIndex,
    loadingWp,
    artistWp,
    coverReady,
    showSpotifyBg,
    spotifyArtUrl: spotify?.art_url ?? "",
    now,
    showConfig,
    showPair,
    pairInfo,
    onRate,
    toggleConfig,
    openPair,
    closePair,
  };
}
