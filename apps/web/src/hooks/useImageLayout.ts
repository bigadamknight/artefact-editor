import { useEffect, useState } from "react";

export interface ImageRegion {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageLayout {
  width: number;
  height: number;
  regions: ImageRegion[];
}

export function useImageLayout(
  projectId: string,
  entry: string,
  bumpKey: number,
  enabled: boolean,
): { layout: ImageLayout | null } {
  const [layout, setLayout] = useState<ImageLayout | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    fetch(`/preview/${projectId}/${entry}.layout.json?v=${bumpKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLayout(data && Array.isArray(data.regions) ? (data as ImageLayout) : null);
      })
      .catch(() => {
        if (!cancelled) setLayout(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, entry, bumpKey, enabled]);

  return { layout };
}
