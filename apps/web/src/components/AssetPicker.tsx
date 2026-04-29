import { useEffect, useState } from "react";
import { Button } from "./ui/button.js";

interface AssetPickerProps {
  projectId: string;
  current: string;
  onPick: (path: string) => void;
}

export function AssetPicker({ projectId, current, onPick }: AssetPickerProps) {
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

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {assets.map((a) => {
          const isCurrent = a === current;
          return (
            <button
              key={a}
              type="button"
              onClick={() => onPick(a)}
              className={[
                "group relative aspect-square overflow-hidden rounded-md border",
                isCurrent ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary",
              ].join(" ")}
              title={a}
            >
              <img src={`/preview/${projectId}/${a}`} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
      {assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No assets in /assets/</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Current: {current || "(none)"}</p>
      <Button variant="outline" size="sm" onClick={() => onPick("")}>
        Clear
      </Button>
    </div>
  );
}
