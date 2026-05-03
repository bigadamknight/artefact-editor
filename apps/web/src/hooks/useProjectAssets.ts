import { useEffect, useState } from "react";

export function useProjectAssets(projectId: string): { assets: string[] } {
  const [assets, setAssets] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/assets`);
        const data = (await res.json()) as { assets: string[] };
        if (!cancelled) setAssets(data.assets);
      } catch {
        if (!cancelled) setAssets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { assets };
}
