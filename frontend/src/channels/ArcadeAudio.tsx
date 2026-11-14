import { useEffect, useRef, useState } from "react";

/**
 * Audio del Arcade vía MediaSource (AAC fMP4).
 *
 * No va por el canvas porque el video ahora viaja como frames crudos por
 * WebSocket; el audio conserva el pipeline AAC/MSE.
 */
function append(buffer: SourceBuffer, chunk: Uint8Array): Promise<boolean> {
  return new Promise((resolve) => {
    const tryAppend = () => {
      if (buffer.updating) {
        buffer.addEventListener("updateend", tryAppend, { once: true });
        return;
      }
      try {
        buffer.appendBuffer(chunk as unknown as BufferSource);
      } catch {
        resolve(false);
        return;
      }
      buffer.addEventListener("updateend", () => resolve(true), { once: true });
    };
    tryAppend();
  });
}

function trim(audio: HTMLAudioElement, buffer: SourceBuffer) {
  if (buffer.updating || buffer.buffered.length === 0) return;
  const start = buffer.buffered.start(0);
  if (audio.currentTime - start > 4) {
    try {
      buffer.remove(start, audio.currentTime - 2);
    } catch {
      /* remove falla si el buffer está updating */
    }
  }
}

export default function ArcadeAudio({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (typeof MediaSource === "undefined") {
      setFailed(true);
      return;
    }

    const media = new MediaSource();
    const objectUrl = URL.createObjectURL(media);
    audio.src = objectUrl;
    let cancelled = false;
    let controller: AbortController | null = null;

    const onSourceOpen = async () => {
      if (cancelled || media.readyState !== "open") return;
      let buffer: SourceBuffer;
      try {
        buffer = media.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
      } catch {
        setFailed(true);
        return;
      }
      controller = new AbortController();
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const reader = response.body.getReader();
        audio.play().catch(() => {});
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          if (!(await append(buffer, value))) break;
          trim(audio, buffer);
        }
      } catch {
        /* cancelado o red caída: el componente se desmonta con el player */
      }
    };

    media.addEventListener("sourceopen", onSourceOpen);

    return () => {
      cancelled = true;
      controller?.abort();
      media.removeEventListener("sourceopen", onSourceOpen);
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute("src");
      audio.load();
    };
  }, [src]);

  const hidden = {
    position: "absolute" as const,
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: "none" as const,
  };

  if (failed) {
    return <audio src={src} autoPlay style={hidden} />;
  }
  return <audio ref={audioRef} autoPlay style={hidden} />;
}
