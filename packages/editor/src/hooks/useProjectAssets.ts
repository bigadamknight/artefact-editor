import { useEffect, useState } from "react";
import type { ListAssetsResponse } from "@artefact-editor/contract";
import { apiPath, useEditorConfig } from "../config.js";

export function useProjectAssets(projectId: string): { assets: string[] } {
  const config = useEditorConfig();
  const [assets, setAssets] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiPath(config, `/projects/${projectId}/assets`));
        const data = (await res.json()) as ListAssetsResponse;
        if (!cancelled) setAssets(data.assets);
      } catch {
        if (!cancelled) setAssets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, config]);

  return { assets };
}
