import { useSyncExternalStore } from "react";

// Same hash route as apps/web: #/p/:id.
const ROUTE = /^#\/p\/([^/?]+)/;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): string | null {
  const match = ROUTE.exec(window.location.hash);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function useHashProjectId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
