import { useEffect, useState } from "react";
import type { ImageLayout } from "@artefact-editor/contract";
import { previewPath, useEditorConfig } from "../config.js";

export type { ImageLayout, ImageRegion } from "@artefact-editor/contract";

export function useImageLayout(
  projectId: string,
  entry: string,
  bumpKey: number,
  enabled: boolean,
): { layout: ImageLayout | null } {
  const config = useEditorConfig();
  const [layout, setLayout] = useState<ImageLayout | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    fetch(previewPath(config, `${projectId}/${entry}.layout.json?v=${bumpKey}`))
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
  }, [projectId, entry, bumpKey, enabled, config]);

  return { layout };
}
