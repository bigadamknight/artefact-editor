import { TriangleAlert } from "lucide-react";
import { Button } from "@hyperframes/studio";

export interface ConflictBannerProps {
  filePath: string;
  onReload: () => void;
  onDismiss: () => void;
}

/** Shown when a timeline edit hit a file that changed on disk since it was read. */
export function ConflictBanner({ filePath, onReload, onDismiss }: ConflictBannerProps) {
  return (
    <div className="ae-conflict" role="alert">
      <TriangleAlert size={14} aria-hidden="true" />
      <span className="ae-conflict__text">
        {filePath} changed on disk, so the last timeline edit was not saved. Reload to pick up
        the current file, then redo the edit.
      </span>
      <Button size="sm" variant="primary" onClick={onReload}>
        Reload
      </Button>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
