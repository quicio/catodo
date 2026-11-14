import { useEffect } from "react";

/**
 * Audio PCM del Arcade por WebSocket + AudioWorklet.
 *
 * El worklet mantiene su propio buffer y consume muestras en el hilo de audio,
 * inmune al jitter del hilo principal (que está subiendo frames de video a
 * WebGL). Arranca con ~80 ms de prebuffer y luego va al ritmo del reloj de audio.
 */
const WORKLET = `
class ArcadePcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.offset = 0;
    this.total = 0;
    this.started = false;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || !data.length) return;
      this.chunks.push(data);
      this.total += data.length;
      // Tope ~1 s: si el hilo principal se atrasó, se descarta lo más viejo.
      while (this.total > 64000) {
        const old = this.chunks.shift();
        if (!old) break;
        this.total -= old.length;
      }
    };
  }

  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1];
    if (!this.started) {
      if (this.total < 5120) {
        left.fill(0);
        right.fill(0);
        return true;
      }
      this.started = true;
    }
    let i = 0;
    while (i < left.length) {
      if (!this.chunks.length) {
        left[i] = 0;
        right[i] = 0;
        i += 1;
        continue;
      }
      const chunk = this.chunks[0];
      const frames = chunk.length >> 1;
      const take = Math.min(frames - this.offset, left.length - i);
      for (let k = 0; k < take; k += 1) {
        const source = (this.offset + k) * 2;
        left[i + k] = chunk[source] / 32768;
        right[i + k] = chunk[source + 1] / 32768;
      }
      i += take;
      this.offset += take;
      if (this.offset >= frames) {
        this.total -= chunk.length;
        this.chunks.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("arcade-pcm", ArcadePcm);
`;

export default function ArcadeAudio({ src }: { src: string }) {
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    let context: AudioContext | null = null;
    let node: AudioWorkletNode | null = null;
    let moduleUrl: string | null = null;
    let ready = false;

    const connect = () => {
      socket = new WebSocket(src);
      socket.binaryType = "arraybuffer";
      socket.onmessage = async (event) => {
        if (cancelled) return;
        if (typeof event.data === "string") {
          let rate = 48000;
          try {
            rate = (JSON.parse(event.data) as { rate?: number }).rate || rate;
          } catch {
            /* mensaje inesperado */
          }
          if (!context) {
            try {
              context = new AudioContext({ sampleRate: rate });
            } catch {
              context = new AudioContext();
            }
            await context.resume().catch(() => {});
            moduleUrl = URL.createObjectURL(
              new Blob([WORKLET], { type: "application/javascript" }),
            );
            try {
              await context.audioWorklet.addModule(moduleUrl);
              node = new AudioWorkletNode(context, "arcade-pcm");
              node.connect(context.destination);
              ready = true;
            } catch {
              ready = false;
            }
          }
          return;
        }
        if (!ready || !node) return;
        if (!(event.data instanceof ArrayBuffer)) return;
        if (context && context.state === "suspended") context.resume().catch(() => {});
        node.port.postMessage(new Int16Array(event.data));
      };
      socket.onclose = () => {
        if (cancelled) return;
        retry = window.setTimeout(connect, 800);
      };
    };

    const resume = () => context?.resume().catch(() => {});
    window.addEventListener("keydown", resume);
    window.addEventListener("mousedown", resume);
    connect();

    return () => {
      cancelled = true;
      if (retry !== null) window.clearTimeout(retry);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("mousedown", resume);
      socket?.close();
      node?.disconnect();
      context?.close();
      if (moduleUrl) URL.revokeObjectURL(moduleUrl);
    };
  }, [src]);

  return null;
}
