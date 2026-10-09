import { useEffect, useState } from "react";

export interface CompositionMeta {
  fps: number;
  width: number;
  height: number;
}

/** Used when the scenes route is missing or answers badly. */
export const DEFAULT_COMPOSITION_META: CompositionMeta = { fps: 30, width: 1920, height: 1080 };

const positive = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

async function loadCompositionMeta(projectId: string, signal: AbortSignal): Promise<CompositionMeta> {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/scenes`, { signal });
    if (!response.ok) return DEFAULT_COMPOSITION_META;
    const body = (await response.json()) as Partial<CompositionMeta>;
    return {
      fps: positive(body.fps, DEFAULT_COMPOSITION_META.fps),
      width: positive(body.width, DEFAULT_COMPOSITION_META.width),
      height: positive(body.height, DEFAULT_COMPOSITION_META.height),
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return DEFAULT_COMPOSITION_META;
  }
}

type Loaded = { projectId: string; meta: CompositionMeta };

/**
 * The root composition's frame rate and size, from the scenes route.
 * `undefined` until the first answer for this project, so callers never
 * build frame URLs with a guessed frame rate and then rebuild them.
 */
export function useCompositionMeta(projectId: string | null): CompositionMeta | undefined {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    loadCompositionMeta(projectId, controller.signal).then(
      (meta) => setLoaded({ projectId, meta }),
      () => {},
    );
    return () => controller.abort();
  }, [projectId]);

  return loaded?.projectId === projectId ? loaded.meta : undefined;
}
