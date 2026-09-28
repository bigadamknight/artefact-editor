import { useSyncExternalStore } from "react";
import { liveTime, usePlayerStore } from "@hyperframes/studio";

// The playhead ticks every animation frame. The transport only needs a
// readable clock, so the snapshot is quantised to STEP seconds: React
// re-renders the page ten times a second while playing, not sixty.
const STEP = 0.1;

let latestTime = 0;

function subscribe(onChange: () => void): () => void {
  latestTime = usePlayerStore.getState().currentTime;
  const stopLive = liveTime.subscribe((time) => {
    latestTime = time;
    onChange();
  });
  const stopStore = usePlayerStore.subscribe((state, prev) => {
    if (state.currentTime === prev.currentTime) return;
    latestTime = state.currentTime;
    onChange();
  });
  return () => {
    stopLive();
    stopStore();
  };
}

function getSnapshot(): number {
  return Math.floor(latestTime / STEP) * STEP;
}

/** The playhead position in seconds, quantised to 0.1 s. */
export function useLiveTime(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
