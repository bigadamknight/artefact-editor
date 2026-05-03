import { useEffect, useMemo, useRef } from "react";
import { useDoc, getEffectiveValue } from "./hooks/useDoc.js";
import { useElementStyles } from "./hooks/useElementStyles.js";
import { useSelection } from "./hooks/useSelection.js";
import { useTransport } from "./hooks/useTransport.js";
import { useProjectAssets } from "./hooks/useProjectAssets.js";
import { useImageLayout } from "./hooks/useImageLayout.js";
import { Inspector } from "./components/Inspector.js";
import { PreviewFrame } from "./components/PreviewFrame.js";
import { Timeline } from "./components/Timeline.js";
import { TopBar } from "./components/TopBar.js";
import { TransportBar } from "./components/TransportBar.js";
import {
  EditorConfigContext,
  apiPath,
  useEditorConfig,
  type EditorConfig,
} from "./config.js";

export interface ArtefactEditorProps {
  projectId: string;
  /** Override the JSON API base URL (default `/api`). */
  apiUrl?: string;
  /** Override the preview base URL (default `/preview`). */
  previewUrl?: string;
  /** Optional back-navigation handler — when provided, TopBar shows a back button. */
  onBack?: () => void;
}

export function ArtefactEditor({ projectId, apiUrl, previewUrl, onBack }: ArtefactEditorProps) {
  const config = useMemo<EditorConfig>(
    () => ({ apiUrl: apiUrl ?? "/api", previewUrl: previewUrl ?? "/preview" }),
    [apiUrl, previewUrl],
  );
  return (
    <EditorConfigContext.Provider value={config}>
      <ArtefactEditorInner projectId={projectId} onBack={onBack} />
    </EditorConfigContext.Provider>
  );
}

interface ArtefactEditorInnerProps {
  projectId: string;
  onBack?: () => void;
}

function ArtefactEditorInner({ projectId, onBack }: ArtefactEditorInnerProps) {
  const config = useEditorConfig();
  const { state, setProperty, save, render } = useDoc(projectId);
  const { selectedBlockId, setSelectedBlockId } = useSelection();
  const transport = useTransport();
  const stylesByBlock = useElementStyles();

  const selectedBlock = useMemo(
    () => state.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [state.blocks, selectedBlockId],
  );

  const isImageTemplate = state.artefact === "image-template";
  const isVideo = state.artefact === "hyperframes";
  const isWebApp = state.artefact === "html-app";
  const { assets } = useProjectAssets(projectId);
  const { layout } = useImageLayout(projectId, state.entry, state.bumpKey, isImageTemplate);
  // hyperframes → scaled iframe + transport + timeline (even if a particular
  // composition has no audio/timing blocks, it's still a fixed-size video).
  // html-app → fill the pane, no transport.
  // image-template → static <img> preview.
  const previewFit = isImageTemplate ? "image" : isWebApp ? "fill" : "scaled";
  const showTimeline = isVideo;

  const specKeyToBlockId = useMemo(() => {
    const map: Record<string, string> = {};
    if (!isImageTemplate) return map;
    for (const b of state.blocks) {
      if (b.source.tag === "specKey") map[b.source.specKey] = b.id;
    }
    return map;
  }, [isImageTemplate, state.blocks]);

  useEffect(() => {
    if (!selectedBlockId && state.blocks.length > 0) {
      setSelectedBlockId(state.blocks[0]!.id);
    }
  }, [selectedBlockId, state.blocks, setSelectedBlockId]);

  useEffect(() => {
    if (!transport.state.ready) return;
    transport.postToIframe({ type: "ae:set-selected", blockId: selectedBlockId });
  }, [selectedBlockId, transport.state.ready, state.bumpKey, transport.postToIframe]);

  // Stash transport + save handlers in a ref so the keydown listener mounts
  // once. Without this, every transport tick (each rAF during playback) tears
  // the listener down and re-attaches it.
  const keyHandlersRef = useRef({ save, transport, isDirty: state.isDirty, saving: state.saving });
  keyHandlersRef.current = { save, transport, isDirty: state.isDirty, saving: state.saving };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const h = keyHandlersRef.current;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (h.isDirty && !h.saving) void h.save();
      } else if (e.code === "Space" && h.transport.state.ready) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          h.transport.toggle();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        showRender={isImageTemplate || isVideo}
        rendering={state.rendering}
        onRender={() => void render()}
        renderKind={isVideo ? "video" : "image"}
        onDownload={() => {
          // Browser handles the download via content-disposition header.
          window.location.assign(apiPath(config, `/projects/${projectId}/archive`));
        }}
        onBack={onBack}
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
        <main className="relative flex min-w-0 flex-1 flex-col bg-muted">
          {state.rendering ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
              <div className="text-sm font-medium">
                {isVideo ? "Rendering MP4…" : "Rendering…"}
              </div>
              <div className="max-w-md text-center text-xs text-muted-foreground">
                {isVideo
                  ? "Hyperframes is rendering frames at draft quality. This usually takes 30–90 seconds — the MP4 will open in a new tab when it's ready."
                  : "Re-running the template…"}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <PreviewFrame
              ref={transport.registerIframe}
              projectId={projectId}
              entry={state.entry}
              bumpKey={state.bumpKey}
              fit={previewFit}
              stale={state.previewStale}
              specKeyToBlockId={specKeyToBlockId}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              layout={layout}
            />
          </div>
          {!showTimeline ? null : (
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
            projectId={projectId}
            block={selectedBlock}
            values={valuesForSelected}
            styles={selectedBlock ? stylesByBlock[selectedBlock.id] : undefined}
            assets={assets}
            onChange={(key, value) => {
              if (selectedBlock) setProperty(selectedBlock.id, key, value);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
