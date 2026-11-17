import { useEffect, useRef, useState } from "react";

export type ArcadeShader = "nearest" | "crt" | "smooth";

/**
 * Dibuja los frames crudos del arcade en un canvas WebGL.
 *
 * El backend manda por WebSocket `width u32 LE | height u32 LE | RGBA`. Al no
 * pasar por H.264/MSE no hay GOP ni rebuffering: el frame llega y se dibuja en
 * el siguiente rAF (~1-2 frames de latencia en localhost).
 */
export default function ArcadeCanvas({
  framesUrl,
  fallbackSrc,
  shader,
  outputHeight,
  aspectRatio,
  fill = false,
  curvature = 0.025,
}: {
  framesUrl: string;
  fallbackSrc?: string;
  shader: ArcadeShader;
  outputHeight: number;
  aspectRatio?: number;
  /** Escala el canvas al 100% del contenedor (el contenedor ya respeta el aspect). */
  fill?: boolean;
  /** Curvatura del tubo en modo CRT (0 = plano). */
  curvature?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<{ width: number; height: number; data: Uint16Array; serial: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState(false);

  // WebSocket de frames. Sólo guarda el último: si el cliente no da abasto se
  // saltean frames en vez de acumular latencia.
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    let serial = 0;

    const connect = () => {
      socket = new WebSocket(framesUrl);
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event) => {
        const raw = event.data;
        if (!(raw instanceof ArrayBuffer) || raw.byteLength < 8) return;
        const view = new DataView(raw);
        const width = view.getUint32(0, true);
        const height = view.getUint32(4, true);
        if (!width || !height || raw.byteLength < 8 + width * height * 2) return;
        serial += 1;
        frameRef.current = {
          width,
          height,
          data: new Uint16Array(raw, 8, width * height),
          serial,
        };
        setError(false);
      };
      socket.onerror = () => setError(true);
      socket.onclose = () => {
        if (cancelled) return;
        setError(true);
        retry = window.setTimeout(connect, 800);
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (retry !== null) window.clearTimeout(retry);
      socket?.close();
    };
  }, [framesUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
      uniform float curvature;

      void main() {
        vec2 p = uv;
        if (mode == 1) {
          // CRT: barril con borde curvo. El mismo slider controla la
          // deformación del contenido y el pequeño margen negro del contorno.
          vec2 c = p * 2.0 - 1.0;
          c *= 1.0 + curvature * dot(c, c);
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

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const filter = shader === "smooth" ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    const modeUniform = gl.getUniformLocation(program, "mode");
    gl.uniform1i(modeUniform, shader === "crt" ? 1 : 0);
    const curvatureUniform = gl.getUniformLocation(program, "curvature");
    gl.uniform1f(curvatureUniform, curvature);
    const sizeUniform = gl.getUniformLocation(program, "sourceSize");

    let frame = 0;
    let stopped = false;
    let texWidth = 0;
    let texHeight = 0;
    let drawn = 0;

    const render = () => {
      if (stopped) return;
      frame = requestAnimationFrame(render);
      const source = frameRef.current;
      if (!source) return;

      const targetHeight = Math.max(240, outputHeight);
      const aspect =
        aspectRatio && aspectRatio > 0 ? aspectRatio : source.width / source.height;
      const targetWidth = Math.round(targetHeight * aspect);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      if (source.width !== texWidth || source.height !== texHeight) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB,
          source.width,
          source.height,
          0,
          gl.RGB,
          gl.UNSIGNED_SHORT_5_6_5,
          source.data,
        );
        texWidth = source.width;
        texHeight = source.height;
        gl.uniform2f(sizeUniform, source.width, source.height);
      } else if (source.serial !== drawn) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          source.width,
          source.height,
          gl.RGB,
          gl.UNSIGNED_SHORT_5_6_5,
          source.data,
        );
      }
      drawn = source.serial;
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
  }, [shader, outputHeight, aspectRatio, curvature]);

  if (failed) {
    return fallbackSrc ? (
      <video
        src={fallbackSrc}
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
      />
    ) : (
      <div style={{ display: "grid", placeItems: "center", height: "100%", opacity: 0.6 }}>
        WebGL no disponible
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: fill ? "100%" : "auto",
          height: fill ? "100%" : "auto",
          maxWidth: "100%",
          maxHeight: "100%",
          imageRendering: "pixelated",
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
          reconectando video…
        </div>
      )}
    </div>
  );
}
