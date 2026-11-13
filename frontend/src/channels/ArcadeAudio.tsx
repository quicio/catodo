import { useEffect, useRef, useState } from "react";

/**
 * Audio del Arcade vía MediaSource Extensions.
 *
 * El endpoint entrega fMP4 (AAC) en vivo; MSE es la forma estándar de
 * reproducirlo en Chromium (un `<audio src>` directo queda en readyState 0 con
 * streams chunked que se reinician).
 */
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

    const append = (buffer: SourceBuffer, chunk: Uint8Array) =>
      new Promise<void>((resolve) => {
        if (buffer.updating) {
          const onEnd = () => {
            buffer.removeEventListener("updateend", onEnd);
            resolve();
          };
          buffer.addEventListener("updateend", onEnd);
          return;
        }
        try {
          buffer.appendBuffer(chunk as unknown as BufferSource);
        } catch {
          resolve();
          return;
        }
        const onEnd = () => {
          buffer.removeEventListener("updateend", onEnd);
          resolve();
        };
        buffer.addEventListener("updateend", onEnd);
      });

    const onSourceOpen = async () => {
      if (cancelled) return;
      if (media.readyState !== "open") return;
      let buffer: SourceBuffer;
      try {
        buffer = media.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
      } catch {
        setFailed(true);
        return;
      }
      audio.play().catch(() => {});

      controller = new AbortController();
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const reader = response.body.getReader();
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          await append(buffer, value);
          // Evita que el buffer crezca sin límite en sesiones largas.
          if (buffer.buffered.length > 0) {
            const start = buffer.buffered.start(0);
            const end = buffer.buffered.end(buffer.buffered.length - 1);
            if (end - start > 20) {
              try {
                buffer.remove(start, end - 10);
              } catch {
                /* el remove puede fallar si el buffer está updating */
              }
            }
          }
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

  if (failed) {
    // Fallback: reproducción directa (puede quedar inestable en algunos casos).
    return (
      <audio
        src={src}
        autoPlay
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
    );
  }

  return (
    <audio
      ref={audioRef}
      autoPlay
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
    />
  );
}
