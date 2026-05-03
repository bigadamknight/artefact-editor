import { Button } from "./ui/button.js";
import { previewPath, useEditorConfig } from "../config.js";

interface AssetPickerProps {
  projectId: string;
  assets: string[];
  current: string;
  onPick: (path: string) => void;
}

export function AssetPicker({ projectId, assets, current, onPick }: AssetPickerProps) {
  const config = useEditorConfig();
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
              <img src={previewPath(config, `${projectId}/${a}`)} alt="" className="h-full w-full object-cover" />
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
