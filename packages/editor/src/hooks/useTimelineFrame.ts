import { useCallback, useEffect, useRef } from "react";

/** Messages exchanged with the timeline app (apps/timeline). */
const TIMELINE_CHANGED = "ae:timeline-changed";
const REFRESH_PREVIEW = "ae:refresh-preview";

interface UseTimelineFrameOptions {
  /** The timeline frame's URL; messages from any other origin are ignored. */
  src: string;
  /** Called when the timeline wrote a project file. */
  onChanged: () => void;
}

/**
 * The bridge between the editor and the embedded timeline frame. The
 * timeline writes project files itself and reports each write; the editor
 * tells it to reload its preview after the editor saves.
 */
export function useTimelineFrame({ src, onChanged }: UseTimelineFrameOptions) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const frameOrigin = new URL(src, window.location.href).origin;

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== frameOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown } | null;
      if (data?.type === TIMELINE_CHANGED) onChangedRef.current();
    },
    [frameOrigin],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const refreshPreview = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: REFRESH_PREVIEW }, frameOrigin);
  }, [frameOrigin]);

  return { frameRef, refreshPreview };
}
