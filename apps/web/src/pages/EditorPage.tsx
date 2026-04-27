import { useEffect, useMemo } from "react";
import { useDoc, getEffectiveValue } from "../hooks/useDoc.js";
import { useSelection } from "../hooks/useSelection.js";
import { Inspector } from "../components/Inspector.js";
import { PreviewFrame } from "../components/PreviewFrame.js";
import { TopBar } from "../components/TopBar.js";

export default function EditorPage() {
  const { state, setProperty, save } = useDoc();
  const { selectedBlockId, setSelectedBlockId } = useSelection();

  const selectedBlock = useMemo(
    () => state.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [state.blocks, selectedBlockId],
  );

  // Auto-select first block once data lands.
  useEffect(() => {
    if (!selectedBlockId && state.blocks.length > 0) {
      setSelectedBlockId(state.blocks[0]!.id);
    }
  }, [selectedBlockId, state.blocks, setSelectedBlockId]);

  // Cmd/Ctrl-S to save.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (state.isDirty && !state.saving) void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isDirty, state.saving, save]);

  const valuesForSelected = useMemo(() => {
    if (!selectedBlock) return {};
    const out: Record<string, string | number> = {};
    for (const desc of selectedBlock.descriptors) {
      out[desc.key] = getEffectiveValue(selectedBlock, state.pendingValues, desc.key);
    }
    return out;
  }, [selectedBlock, state.pendingValues]);

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <div className="text-sm font-semibold text-red-600">Failed to load project</div>
        <pre className="max-w-lg whitespace-pre-wrap text-xs text-muted-foreground">
          {state.error}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        name={state.name}
        isDirty={state.isDirty}
        saving={state.saving}
        onSave={() => void save()}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 flex-col border-r border-border">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Blocks
          </div>
          <div className="flex-1 overflow-auto">
            {state.blocks.map((b) => {
              const isPending = state.pendingValues.has(b.id);
              const isSelected = b.id === selectedBlockId;
              return (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setSelectedBlockId(b.id)}
                  className={[
                    "flex w-full items-center justify-between border-b border-border px-4 py-2 text-left text-sm hover:bg-muted",
                    isSelected ? "bg-muted" : "",
                  ].join(" ")}
                >
                  <span className="truncate">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {b.kind}
                    </span>
                    <span className="ml-2">{b.label}</span>
                  </span>
                  {isPending ? (
                    <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-muted">
          <PreviewFrame entry={state.entry} bumpKey={state.bumpKey} />
        </main>
        <aside className="w-80 overflow-auto border-l border-border">
          <Inspector
            block={selectedBlock}
            values={valuesForSelected}
            onChange={(key, value) => {
              if (selectedBlock) setProperty(selectedBlock.id, key, value);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
