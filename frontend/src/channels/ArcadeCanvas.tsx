import { useEffect, useRef, useState } from "react";

export type ArcadeShader = "nearest" | "crt" | "smooth";

/**
 * Dibuja el stream del arcade en un canvas WebGL y aplica el upscaler.
 *
 * El `<video>` sigue existiendo (oculto) porque es quien decodifica el fMP4 y
 * aporta los frames/audio; el canvas es el que escala a 720p/1080p con shader.
 */
export default function ArcadeCanvas({
  src,
  shader,
  outputHeight,
  aspectRatio,
}: {
  src: string;
  shader: ArcadeShader;
  outputHeight: number;
  aspectRatio?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState(false);

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

  if (failed) {
    return (
      <video
        src={src}
        autoPlay
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          background: "#000",
          imageRendering: "pixelated",
        }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
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
