import { useCallback, useEffect, useMemo } from "react";
import { useDoc, getEffectiveValue } from "../hooks/useDoc.js";
import { useElementStyles } from "../hooks/useElementStyles.js";
import { useSelection } from "../hooks/useSelection.js";
import { useTransport } from "../hooks/useTransport.js";
import { Inspector } from "../components/Inspector.js";
import { PreviewFrame } from "../components/PreviewFrame.js";
import { Timeline } from "../components/Timeline.js";
import { TopBar } from "../components/TopBar.js";
import { TransportBar } from "../components/TransportBar.js";

export default function EditorPage() {
  const { state, setProperty, save } = useDoc();
  const { selectedBlockId, setSelectedBlockId } = useSelection();
  const transport = useTransport();
  const stylesByBlock = useElementStyles();
  const setIframeRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      transport.registerIframe(el);
    },
    [transport.registerIframe],
  );

  const selectedBlock = useMemo(
    () => state.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [state.blocks, selectedBlockId],
  );

  // Web-app artefacts have no audio or timing blocks. We use this to swap the
  // editor chrome: video mode shows transport+timeline; web-app mode hides
  // them and gives the preview the full pane at native size.
  const isWebApp = useMemo(
    () => !state.blocks.some((b) => b.kind === "audio" || b.kind === "timing"),
    [state.blocks],
  );

  useEffect(() => {
    if (!selectedBlockId && state.blocks.length > 0) {
      setSelectedBlockId(state.blocks[0]!.id);
    }
  }, [selectedBlockId, state.blocks, setSelectedBlockId]);

  useEffect(() => {
    if (!transport.state.ready) return;
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="preview"]');
    iframe?.contentWindow?.postMessage(
      { type: "ae:set-selected", blockId: selectedBlockId },
      "*",
    );
  }, [selectedBlockId, transport.state.ready, state.bumpKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (state.isDirty && !state.saving) void save();
      } else if (e.code === "Space" && transport.state.ready) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          transport.toggle();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isDirty, state.saving, save, transport]);

  const valuesForSelected = useMemo(() => {
    if (!selectedBlock) return {};
    const out: Record<string, string | number> = {};
    for (const desc of selectedBlock.descriptors) {
      // Skip synthetic style.* descriptors; their initial values come from the
      // live computed-style channel, not from the manifest. Only pending edits
      // appear in `out` for these keys (added below).
      if (desc.key.startsWith("style.")) continue;
      out[desc.key] = getEffectiveValue(selectedBlock, state.pendingValues, desc.key);
    }
    const pending = state.pendingValues.get(selectedBlock.id);
    if (pending) {
      for (const [k, v] of Object.entries(pending)) {
        if (k.startsWith("style.")) out[k] = v;
      }
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
        <main className="flex min-w-0 flex-1 flex-col bg-muted">
          <div className="min-h-0 flex-1">
            <PreviewFrame
              ref={setIframeRef}
              entry={state.entry}
              bumpKey={state.bumpKey}
              fit={isWebApp ? "fill" : "scaled"}
            />
          </div>
          {isWebApp ? null : (
            <div className="flex shrink-0 flex-col border-t border-border" style={{ height: 304 }}>
              <TransportBar
                time={transport.state.time}
                duration={transport.state.duration}
                playing={transport.state.playing}
                ready={transport.state.ready}
                onToggle={transport.toggle}
                onSeek={transport.seek}
              />
              <div className="min-h-0 flex-1">
                <Timeline
                  blocks={state.blocks}
                  selectedBlockId={selectedBlockId}
                  pendingValues={state.pendingValues}
                  playheadTime={transport.state.ready ? transport.state.time : undefined}
                  onSelectBlock={setSelectedBlockId}
                  onSetProperty={(id, key, value) => setProperty(id, key, value)}
                  onSeek={transport.seek}
                />
              </div>
            </div>
          )}
        </main>
        <aside className="w-80 overflow-auto border-l border-border">
          <Inspector
            block={selectedBlock}
            values={valuesForSelected}
            styles={selectedBlock ? stylesByBlock[selectedBlock.id] : undefined}
            onChange={(key, value) => {
              if (selectedBlock) setProperty(selectedBlock.id, key, value);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
