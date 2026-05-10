import { useEffect, useRef, useState } from "react";
import type { SpeechBubble } from "@artefact-editor/core";

export interface SpeechBubblePanelProps {
  bubbles: SpeechBubble[];
  selectedId: string | null;
  saving: boolean;
  isDirty: boolean;
  onAdd: () => void;
  onSave: () => void;
  onPatch: (id: string, patch: Partial<SpeechBubble>) => void;
  onDelete: (id: string) => void;
  /** Re-insert a previously-deleted bubble at the given index. */
  onRestore: (bubble: SpeechBubble, index: number) => void;
  onSelect: (id: string | null) => void;
}

/**
 * Toolbar (Add / Save / status) plus an inline inspector row for the selected
 * bubble. Lives below the canvas so it never covers the artwork. Delete is
 * one-click + a 6-second UNDO in the status area (no modal confirm — earlier
 * iteration of the standalone preview had a flaky native confirm).
 */
export function SpeechBubblePanel({
  bubbles,
  selectedId,
  saving,
  isDirty,
  onAdd,
  onSave,
  onPatch,
  onDelete,
  onRestore,
  onSelect,
}: SpeechBubblePanelProps) {
  const selected = bubbles.find((b) => b.id === selectedId) ?? null;

  const [undoAvailable, setUndoAvailable] = useState<{
    bubble: SpeechBubble;
    index: number;
    label: string;
  } | null>(null);
  const undoTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    };
  }, []);

  function handleDelete() {
    if (!selected) return;
    const idx = bubbles.findIndex((b) => b.id === selected.id);
    const snapshot = JSON.parse(JSON.stringify(selected)) as SpeechBubble;
    const label = snapshot.text ? snapshot.text.slice(0, 30) : snapshot.id;
    onDelete(selected.id);
    setUndoAvailable({ bubble: snapshot, index: idx, label });
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndoAvailable(null), 6000);
  }

  function handleUndo() {
    if (!undoAvailable) return;
    onRestore(undoAvailable.bubble, undoAvailable.index);
    setUndoAvailable(null);
  }

  return (
    <div className="border-t border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <button
          type="button"
          onClick={onAdd}
          className="rounded border border-border bg-muted px-2 py-1 hover:bg-accent"
        >
          + Add bubble
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !isDirty}
          className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <span className="text-muted-foreground">
          {bubbles.length} bubble{bubbles.length === 1 ? "" : "s"}
          {isDirty ? " · unsaved" : ""}
        </span>
        {undoAvailable ? (
          <span className="ml-2 flex items-center gap-2 rounded bg-amber-50 px-2 py-1 text-amber-900">
            Deleted &ldquo;{undoAvailable.label}&rdquo;
            <button
              type="button"
              onClick={handleUndo}
              className="rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white"
            >
              UNDO
            </button>
          </span>
        ) : null}
        <span className="ml-auto text-muted-foreground">
          blue handle = move bubble · orange = move tail · click bubble to edit
        </span>
      </div>
      {selected ? (
        <div className="flex flex-wrap items-end gap-3 px-3 py-2">
          <Field label="Text" wide>
            <textarea
              rows={2}
              value={selected.text}
              onChange={(e) => onPatch(selected.id, { text: e.target.value })}
              className="w-80 resize-y rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Style">
            <select
              value={selected.style}
              onChange={(e) => onPatch(selected.id, { style: e.target.value as "say" | "whisper" })}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="say">say</option>
              <option value="whisper">whisper</option>
            </select>
          </Field>
          <Field label="Width">
            <input
              type="number"
              step={0.01}
              min={0.05}
              max={0.5}
              value={selected.width}
              onChange={(e) => onPatch(selected.id, { width: parseFloat(e.target.value) })}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Font size">
            <input
              type="number"
              step={0.002}
              min={0.01}
              max={0.08}
              value={selected.fontSize}
              onChange={(e) => onPatch(selected.id, { fontSize: parseFloat(e.target.value) })}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </Field>
          <Field label={`Tail sweep (${(selected.tailSweep ?? 0.7).toFixed(2)})`}>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={selected.tailSweep ?? 0.7}
              onChange={(e) => onPatch(selected.id, { tailSweep: parseFloat(e.target.value) })}
              className="w-40"
            />
          </Field>
          <Field label="Character">
            <input
              type="text"
              value={selected.character ?? ""}
              onChange={(e) => onPatch(selected.id, { character: e.target.value })}
              className="w-32 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </Field>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded border border-border bg-muted px-3 py-1 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Click a bubble to edit it, or hit + Add bubble to create one.
        </div>
      )}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? "" : ""}`}>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
