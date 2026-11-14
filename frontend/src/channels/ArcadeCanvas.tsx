import { useEffect, useRef, useState } from "react";

export type ArcadeShader = "nearest" | "crt" | "smooth";

/**
 * Dibuja el stream del arcade en un canvas WebGL y aplica el upscaler.
 *
 * El `<video>` sigue existiendo (oculto) porque es quien decodifica el fMP4,
 * pero se alimenta por MSE con un `fetch` explícito. El loader nativo del
 * `<video>` se estancaba con el stream chunked en vivo (dejaba de pedir datos
 * por ~15 s y el timeline saltaba al inicio); con MSE el bombeo lo controla
 * este componente y el canvas dibuja el frame actual.
 */

/** Busca el box `avcC` del init segment y arma el codec string para MSE. */
function findAvcC(bytes: Uint8Array): string | null {
  for (let i = 0; i + 7 < bytes.length; i += 1) {
    if (
      bytes[i] === 0x61 && // a
      bytes[i + 1] === 0x76 && // v
      bytes[i + 2] === 0x63 && // c
      bytes[i + 3] === 0x43 // C
    ) {
      const profile = bytes[i + 5];
      const compatibility = bytes[i + 6];
      const level = bytes[i + 7];
      const hex = (value: number) => value.toString(16).padStart(2, "0");
      return `avc1.${hex(profile)}${hex(compatibility)}${hex(level)}`;
    }
  }
  return null;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function appendBuffer(buffer: SourceBuffer, chunk: Uint8Array): Promise<boolean> {
  return new Promise((resolve) => {
    const tryAppend = () => {
      // Si el buffer está ocupado, esperar el updateend y recién ahí agregar.
      // Descartar el chunk produce huecos en el timeline (freezes/saltos).
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

/** Acota el buffer para sesiones largas, sin tocar `currentTime`. */
function trimBuffer(buffer: SourceBuffer) {
  if (buffer.buffered.length === 0) return;
  const start = buffer.buffered.start(0);
  const end = buffer.buffered.end(buffer.buffered.length - 1);
  if (end - start > 20) {
    try {
      buffer.remove(start, end - 10);
    } catch {
      /* remove falla si el buffer está updating */
    }
  }
}

export default function ArcadeCanvas({
  src,
  audioSrc,
  shader,
  outputHeight,
  aspectRatio,
}: {
  src: string;
  audioSrc?: string;
  shader: ArcadeShader;
  outputHeight: number;
  aspectRatio?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [error, setError] = useState(false);

  // Alimentación por MSE: un solo fetch, sin que el media loader se estanque.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof MediaSource === "undefined") {
      setMediaFailed(true);
      return;
    }

    const media = new MediaSource();
    const objectUrl = URL.createObjectURL(media);
    video.src = objectUrl;
    let cancelled = false;
    let controller: AbortController | null = null;
    let videoReady = false;
    let audioReady = !audioSrc;

    const tryPlay = () => {
      if (!cancelled && videoReady && audioReady) video.play().catch(() => {});
    };

    // Audio en el mismo MediaSource que el video: el navegador sincroniza
    // ambos tracks con una sola línea de tiempo.
    const pumpAudio = async (buffer: SourceBuffer, signal: AbortSignal) => {
      try {
        const response = await fetch(audioSrc!, { signal });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        let first = true;
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          if (!(await appendBuffer(buffer, value))) break;
          trimBuffer(buffer);
          if (first) {
            first = false;
            audioReady = true;
            tryPlay();
          }
        }
      } catch {
        // Sin audio el video sigue siendo válido; no se considera fatal.
        audioReady = true;
        tryPlay();
      }
    };

    const onSourceOpen = async () => {
      if (cancelled) return;
      controller = new AbortController();

      if (audioSrc) {
        try {
          const audioBuffer = media.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
          void pumpAudio(audioBuffer, controller.signal);
        } catch {
          audioReady = true;
        }
      }

      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const reader = response.body.getReader();
        let pending: Uint8Array[] = [];
        let pendingBytes = 0;
        let buffer: SourceBuffer | null = null;

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || !value) break;

          if (!buffer) {
            pending.push(value);
            pendingBytes += value.length;
            const joined = concatChunks(pending, pendingBytes);
            const codec = findAvcC(joined);
            if (!codec) {
              if (pendingBytes > 2_000_000) throw new Error("no se encontró avcC");
              continue;
            }
            const type = `video/mp4; codecs="${codec}"`;
            if (!MediaSource.isTypeSupported(type)) {
              throw new Error(`codec no soportado: ${type}`);
            }
            buffer = media.addSourceBuffer(type);
            pending = [];
            pendingBytes = 0;
            if (!(await appendBuffer(buffer, joined))) {
              throw new Error("falló el append inicial");
            }
            videoReady = true;
            tryPlay();
            continue;
          }

          if (!(await appendBuffer(buffer, value))) break;
          trimBuffer(buffer);
        }
      } catch {
        if (!cancelled) setMediaFailed(true);
      }
    };

    media.addEventListener("sourceopen", onSourceOpen);

    return () => {
      cancelled = true;
      controller?.abort();
      media.removeEventListener("sourceopen", onSourceOpen);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };
  }, [src, audioSrc]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) {
      setFailed(true);
      return;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        setFailed(true);
        return null;
      }
      return shader;
    };

    const vertexSource = `#version 300 es
      in vec2 pos;
      out vec2 uv;
      void main() {
        uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
        gl_Position = vec4(pos, 0.0, 1.0);
      }`;

    const fragmentSource = `#version 300 es
      precision mediump float;
      in vec2 uv;
      out vec4 color;
      uniform sampler2D tex;
      uniform vec2 sourceSize;
      uniform int mode;

      void main() {
        vec2 p = uv;
        if (mode == 1) {
          // CRT: curvatura suave
          vec2 c = p * 2.0 - 1.0;
          c *= 1.0 + 0.025 * dot(c, c);
          p = c * 0.5 + 0.5;
          if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
            color = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
        }
        vec4 texel = texture(tex, p);
        if (mode == 1) {
          // scanlines + viñeta
          float scan = 0.86 + 0.14 * sin(p.y * sourceSize.y * 3.14159265);
          texel.rgb *= scan;
          float vignette = smoothstep(1.15, 0.35, length(p - 0.5));
          texel.rgb *= mix(0.72, 1.0, vignette);
        }
        color = vec4(texel.rgb, 1.0);
      }`;

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return;

    const program = gl.createProgram();
    if (!program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLocation = gl.getAttribLocation(program, "pos");
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const filter = shader === "smooth" ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    const modeUniform = gl.getUniformLocation(program, "mode");
    gl.uniform1i(modeUniform, shader === "crt" ? 1 : 0);
    const sizeUniform = gl.getUniformLocation(program, "sourceSize");

    let frame = 0;
    let stopped = false;
    const render = () => {
      if (stopped) return;
      frame = requestAnimationFrame(render);
      if (video.readyState < 2 || video.videoWidth === 0) return;

      const targetHeight = Math.max(240, outputHeight);
      // El core declara la relación de aspecto de pantalla (SNES: 4:3). Si no
      // viene, se usa el aspecto de píxel del stream.
      const aspect =
        aspectRatio && aspectRatio > 0
          ? aspectRatio
          : video.videoWidth / video.videoHeight;
      const targetWidth = Math.round(targetHeight * aspect);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video,
      );
      gl.uniform2f(sizeUniform, video.videoWidth, video.videoHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame = requestAnimationFrame(render);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [shader, outputHeight, aspectRatio]);

  if (failed || mediaFailed) {
    return (
      <>
        <video
          src={src}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
            imageRendering: "pixelated",
          }}
          onError={() => setError(true)}
        />
        {audioSrc && (
          <audio
            src={audioSrc}
            autoPlay
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          // Full-size y apenas visible: si el elemento está oculto/1x1 Chromium
          // throttlea el decoder y el juego se congela cada tanto.
          opacity: 0.01,
          pointerEvents: "none",
          zIndex: 2,
        }}
        onError={() => setError(true)}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: "auto",
          height: "auto",
          maxWidth: "100%",
          maxHeight: "100%",
          imageRendering: "pixelated",
          zIndex: 1,
        }}
      />
      {error && (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            background: "color-mix(in srgb, var(--danger) 25%, transparent)",
            border: "1px solid var(--danger)",
            fontSize: 12,
          }}
        >
          no se pudo abrir el stream del juego
        </div>
      )}
    </div>
  );
}
