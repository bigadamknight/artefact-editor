import { useCallback, useEffect, useRef, useState } from "react";

interface TransportState {
  time: number;
  duration: number | null;
  playing: boolean;
  ready: boolean;
}

export interface UseTransportApi {
  state: TransportState;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  registerIframe: (iframe: HTMLIFrameElement | null) => void;
}

interface IncomingReady {
  type: "ae:ready";
  duration: number | null;
}

interface IncomingTick {
  type: "ae:tick";
  time: number;
  duration: number;
  playing: boolean;
}

type Incoming = IncomingReady | IncomingTick;

export function useTransport(): UseTransportApi {
  const [state, setState] = useState<TransportState>({
    time: 0,
    duration: null,
    playing: false,
    ready: false,
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const post = useCallback((msg: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  const play = useCallback(() => {
    post({ type: "ae:transport", action: "play" });
  }, [post]);

  const pause = useCallback(() => {
    post({ type: "ae:transport", action: "pause" });
  }, [post]);

  const toggle = useCallback(() => {
    post({ type: "ae:transport", action: state.playing ? "pause" : "play" });
  }, [post, state.playing]);

  const seek = useCallback(
    (time: number) => {
      post({ type: "ae:transport", action: "seek", time });
      setState((s) => ({ ...s, time }));
    },
    [post],
  );

  const registerIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
    if (!iframe) {
      setState((s) => ({ ...s, ready: false, playing: false, time: 0 }));
    }
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as Incoming | { type?: string };
      if (!data || typeof data !== "object" || !("type" in data)) return;
      if (data.type === "ae:ready") {
        const d = (data as IncomingReady).duration;
        setState((s) => ({ ...s, ready: true, duration: d, time: 0, playing: false }));
      } else if (data.type === "ae:tick") {
        const t = data as IncomingTick;
        setState((s) => ({ ...s, time: t.time, duration: t.duration, playing: t.playing }));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return { state, play, pause, toggle, seek, registerIframe };
}
