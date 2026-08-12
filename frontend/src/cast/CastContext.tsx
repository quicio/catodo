import { createContext, useContext, useEffect, useRef, useState } from "react";

interface CastState {
  stream: MediaStream | null;
  status: "idle" | "connecting" | "active" | "failed";
}

const CastContext = createContext<CastState>({ stream: null, status: "idle" });

export function CastProvider({ children }: { children: React.ReactNode }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CastState["status"]>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const candidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const closePc = () => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    candidatesRef.current = [];
    setStream(null);
  };

  const makePc = (ws: WebSocket): RTCPeerConnection => {
    closePc();
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setStream(e.streams[0]);
        setStatus("active");
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setStatus("active");
        if (ws.readyState === WebSocket.OPEN) ws.send("__catodo_ready");
      } else if (pc.connectionState === "failed") {
        setStatus("failed");
      } else if (pc.connectionState === "closed") {
        setStream(null);
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
      }
    };
    return pc;
  };

  useEffect(() => {
    let closed = false;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";

    const connect = () => {
      const ws = new WebSocket(`${proto}//${location.host}/api/cast/ws?role=receiver`);
      wsRef.current = ws;

      ws.onmessage = (m) => {
      if (m.data === "__catodo_stop") {
        closePc();
        setStatus("idle");
        return;
      }
      let msg;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return;
      }
      if (msg.type === "offer") {
        const pc = makePc(ws);
        setStatus("connecting");
        pc.setRemoteDescription(msg)
          .then(() => pc.createAnswer())
          .then((ans) => pc.setLocalDescription(ans))
          .then(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(pc.localDescription));
          })
          .then(() => {
            while (candidatesRef.current.length) {
              pc.addIceCandidate(candidatesRef.current.shift() as RTCIceCandidateInit).catch(() => {});
            }
          })
          .catch(() => setStatus("failed"));
      } else if (msg.type === "candidate" && pcRef.current) {
        if (pcRef.current.remoteDescription) {
          pcRef.current.addIceCandidate(msg.candidate).catch(() => {});
        } else {
          candidatesRef.current.push(msg.candidate);
        }
      }
    };

      ws.onclose = () => {
        closePc();
        setStatus("idle");
        if (!closed) setTimeout(connect, 1000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      wsRef.current?.close();
      closePc();
    };
  }, []);

  return <CastContext.Provider value={{ stream, status }}>{children}</CastContext.Provider>;
}

export function useCast() {
  return useContext(CastContext);
}
