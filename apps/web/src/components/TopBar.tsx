import { Save } from "lucide-react";
import { Button } from "./ui/button.js";

interface TopBarProps {
  name: string;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
}

export function TopBar({ name, isDirty, saving, onSave }: TopBarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">artefact-editor</span>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-sm">{name}</span>
        {isDirty ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">
            unsaved
          </span>
        ) : null}
      </div>
      <Button onClick={onSave} disabled={!isDirty || saving} size="sm">
        <Save className="h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
