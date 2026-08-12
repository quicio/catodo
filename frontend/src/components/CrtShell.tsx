import { useEffect, useRef, useState } from "react";

interface CrtShellProps {
  children: React.ReactNode;
  channelId: string | null;
  channelNumber: number;
  volume: number;
}

export default function CrtShell({
  children,
  channelId,
  channelNumber,
  volume,
}: CrtShellProps) {
  const [showChannelNum, setShowChannelNum] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const prevVolumeRef = useRef(volume);
  const prevChannelIdRef = useRef(channelId);

  useEffect(() => {
    if (channelId !== prevChannelIdRef.current) {
      prevChannelIdRef.current = channelId;
      setFlashKey((k) => k + 1);
      setShowChannelNum(true);
      const t = setTimeout(() => setShowChannelNum(false), 1300);
      return () => clearTimeout(t);
    }
  }, [channelId]);

  // Usar un ref para prevVolume: incluir el estado en las deps hacía que el
  // cleanup cancelara el timer de ocultar sin reprogramarlo → el HUD quedaba fijo.
  useEffect(() => {
    if (volume !== prevVolumeRef.current) {
      prevVolumeRef.current = volume;
      setShowVolume(true);
      const t = setTimeout(() => setShowVolume(false), 1500);
      return () => clearTimeout(t);
    }
  }, [volume]);

  const isCast = channelId === "screen-cast";
  return (
    <>
      {children}
      {/* Los efectos CRT no se aplican sobre la proyección de pantalla (espejo fiel) */}
      {!isCast && <div className="crt-scanlines" />}
      {!isCast && <div className="crt-vignette" />}
      {showChannelNum && (
        <div key={flashKey} className="ch-flash">
          <div className="ch-flash-label">CHANNEL</div>
          <div className="ch-flash-num">
            {String(channelNumber).padStart(2, "0")}
          </div>
        </div>
      )}
      {showVolume && (
        <div className="vol-hud">
          <div className="vol-hud-label">VOL</div>
          <div className="vol-hud-bar">
            <div className="vol-hud-fill" style={{ width: `${volume}%` }} />
          </div>
          <div className="vol-hud-num">{volume}</div>
        </div>
      )}
    </>
  );
}
