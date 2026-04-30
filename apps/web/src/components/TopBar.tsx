import { Download, Film, ImageIcon, Save } from "lucide-react";
import { Button } from "./ui/button.js";

interface TopBarProps {
  name: string;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
  showRender?: boolean;
  rendering?: boolean;
  onRender?: () => void;
  renderKind?: "image" | "video";
  onDownload?: () => void;
  onBack?: () => void;
}

export function TopBar({
  name,
  isDirty,
  saving,
  onSave,
  showRender,
  rendering,
  onRender,
  renderKind = "image",
  onDownload,
  onBack,
}: TopBarProps) {
  const RenderIcon = renderKind === "video" ? Film : ImageIcon;
  const renderLabel = renderKind === "video" ? "Render MP4" : "Render";
  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-semibold hover:underline"
          >
            artefact-editor
          </button>
        ) : (
          <span className="text-sm font-semibold">artefact-editor</span>
        )}
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-sm">{name}</span>
        {isDirty ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">
            unsaved
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {onDownload ? (
          <Button onClick={onDownload} size="sm" variant="ghost" title="Download .artefact archive">
            <Download className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {showRender ? (
          <Button onClick={onRender} disabled={rendering || isDirty} size="sm" variant="secondary">
            <RenderIcon className="h-3.5 w-3.5" />
            {rendering ? "Rendering…" : renderLabel}
          </Button>
        ) : null}
        <Button onClick={onSave} disabled={!isDirty || saving} size="sm">
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
