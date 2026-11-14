import { useEffect } from "react";

/**
 * Audio PCM del Arcade por WebSocket + WebAudio.
 *
 * El backend manda `s16le` estéreo intercalado cada ~10 ms y un mensaje de
 * texto inicial `{"rate":…}`. Se programan buffers chicos con un colchón de
 * ~30 ms para mantener el audio pegado al video crudo.
 */
export default function ArcadeAudio({ src }: { src: string }) {
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    let context: AudioContext | null = null;
    let sampleRate = 48000;
    let nextTime = 0;

    const resume = () => {
      context?.resume().catch(() => {});
    };
    window.addEventListener("keydown", resume);
    window.addEventListener("mousedown", resume);

    try {
      context = new AudioContext();
    } catch {
      return undefined;
    }
    context.resume().catch(() => {});

    const connect = () => {
      socket = new WebSocket(src);
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event) => {
        if (!context) return;
        if (typeof event.data === "string") {
          try {
            const info = JSON.parse(event.data) as { rate?: number };
            if (info.rate && info.rate > 0) sampleRate = info.rate;
          } catch {
            /* mensaje inesperado */
          }
          return;
        }
        if (!(event.data instanceof ArrayBuffer)) return;
        if (context.state === "suspended") context.resume().catch(() => {});
        const pcm = new Int16Array(event.data);
        const frames = Math.floor(pcm.length / 2);
        if (frames === 0) return;

        const buffer = context.createBuffer(2, frames, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < frames; i += 1) {
          left[i] = pcm[i * 2] / 32768;
          right[i] = pcm[i * 2 + 1] / 32768;
        }

        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(context.destination);
        const now = context.currentTime;
        // Si nos pasamos del colchón, volvemos al borde en vivo.
        if (nextTime < now + 0.01 || nextTime > now + 0.35) nextTime = now + 0.03;
        node.start(nextTime);
        nextTime += buffer.duration;
      };
      socket.onclose = () => {
        if (cancelled) return;
        retry = window.setTimeout(connect, 800);
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (retry !== null) window.clearTimeout(retry);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("mousedown", resume);
      socket?.close();
      context?.close();
    };
  }, [src]);

  return null;
}
