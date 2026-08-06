import { useEffect, useRef, useState } from "react";
import { Anime4KEngine } from "./anime4k";

/**
 * A4K effect — real Anime4K via WebGL2. Falls back to a 2D canvas render
 * (upscaled + enhanced) if the WebGL engine can't initialize.
 */
export default function Anime4KCanvas({
  src,
  videoEl,
  autoPlay = true,
}: {
  src: string;
  videoEl?: React.RefObject<HTMLVideoElement | null>;
  autoPlay?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<Anime4KEngine | null>(null);
  const [frames, setFrames] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"webgl" | "2d">("webgl");
  const [outRes, setOutRes] = useState<string>("");
  const [gpuInfo, setGpuInfo] = useState<string>("");

  useEffect(() => {
    // Probe del renderer WebGL para diagnóstico de GPU
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") as WebGLRenderingContext | null;
      if (gl) {
        const renderer = gl.getParameter(gl.RENDERER);
        const vendor = gl.getParameter(gl.VENDOR);
        console.log("[catodo] WebGL renderer:", renderer, "| vendor:", vendor);
      } else {
        console.log("[catodo] no webgl");
      }
    } catch (e) {
      console.log("[catodo] gl probe err", e);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      if (!gpu) {
        setGpuInfo("WebGPU: no disponible");
      } else {
        gpu.requestAdapter().then((ad) => setGpuInfo(ad ? "WebGPU: OK" : "WebGPU: sin adapter")).catch(() => setGpuInfo("WebGPU: error"));
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoEl?.current ?? localVideoRef.current;
    if (!canvas || !video) return;

    let engine: Anime4KEngine | null = null;
    try {
      engine = new Anime4KEngine(canvas);
      engineRef.current = engine;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[anime4k] engine init failed, fallback 2d:", msg);
      setMode("2d");
    }

    if (!engine) {
      // 2D fallback
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("no 2d context");
        return;
      }
      let raf = 0;
      let last = 0;
      let count = 0;
      const loop = (t: number) => {
        raf = requestAnimationFrame(loop);
        if (t - last < 33) return;
        last = t;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const w = video.videoWidth, h = video.videoHeight;
          if (canvas.width !== w * 2 || canvas.height !== h * 2) {
            canvas.width = w * 2;
            canvas.height = h * 2;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          count++;
          if (count % 30 === 0) setFrames(count);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    let raf = 0;
    let last = 0;
    let count = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
        try {
          engine!.render(video, video.videoWidth, video.videoHeight);
          count++;
          if (count % 30 === 0) {
            setFrames(count);
            const cv = canvas;
            setOutRes(`${cv.width}×${cv.height}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[anime4k] render error:", msg);
          setError(msg);
          cancelAnimationFrame(raf);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engine?.dispose();
      engineRef.current = null;
    };
  }, [src, videoEl]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {!videoEl && (
        <video
          ref={localVideoRef}
          src={src}
          autoPlay={autoPlay}
          playsInline
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: mode === "2d" ? "contrast(1.12) saturate(1.18) brightness(1.02)" : "contrast(1.08) saturate(1.15)",
        }}
      />
      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            padding: "6px 10px",
            background: "rgba(200,30,30,0.8)",
            color: "#fff",
            fontSize: 11,
            borderRadius: 6,
            fontFamily: "monospace",
            zIndex: 5,
          }}
        >
          A4K: {error}
        </div>
      )}
      {!error && frames > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "2px 6px",
            background: "rgba(0,0,0,0.5)",
            color: mode === "2d" ? "#ffd166" : "#1db954",
            fontSize: 10,
            borderRadius: 4,
            fontFamily: "monospace",
            zIndex: 5,
          }}
        >
          {mode === "2d" ? "2D" : "A4K"} ✓ {frames}
          {outRes && <span style={{ opacity: 0.7 }}> · {outRes}</span>}
          {gpuInfo && <span style={{ opacity: 0.5 }}> · {gpuInfo}</span>}
        </div>
      )}
    </div>
  );
}
