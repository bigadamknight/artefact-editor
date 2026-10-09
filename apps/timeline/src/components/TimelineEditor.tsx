import { memo, type ReactNode } from "react";
import {
  Player,
  Timeline,
  TimelineEditProvider,
  type TimelineClipRenderContext,
  type TimelineEditCallbacks,
  type TimelineElement,
  useTimelineContext,
} from "@hyperframes/studio";
import type { TimelineEditorState } from "../hooks/useTimelineEditor";
import { SceneStripRow } from "./SceneStripRow";

// Keeps a reloading preview loaded but invisible until it is promoted.
const SHADOW_STYLE = {
  position: "absolute",
  inset: 0,
  visibility: "hidden",
  clipPath: "inset(100%)",
  pointerEvents: "none",
} as const;

type RenderClipContent = (
  element: TimelineElement,
  style: { clip: string; label: string },
  context?: TimelineClipRenderContext,
) => ReactNode;

type Filmstrip = TimelineEditorState["filmstrip"];

export interface TimelineEditorProps {
  projectId: string;
  player: TimelineEditorState["player"];
  editCallbacks: TimelineEditCallbacks;
  onSeek: (time: number, options?: { keepPlaying?: boolean }) => void;
  onDeleteElement: (element: TimelineElement) => Promise<void> | void;
  renderClipContent: RenderClipContent;
  filmstrip: Filmstrip;
  transport: ReactNode;
  banner: ReactNode;
  /** Drawn over the preview (the onion skin). */
  previewOverlay?: ReactNode;
  /** A side panel over the preview (the contact sheet). */
  panel?: ReactNode;
}

/**
 * Studio's own <Timeline> view (TimelineView in 0.8.81), spelled out so a row
 * can sit under the lanes. The row comes after the frame, so the frame's
 * sticky ruler is unaffected. Unlike Studio's view, a ready timeline with no
 * clips still draws: projects animated by script alone have none, and the
 * strip row is what shows them.
 */
function TimelineView({ stripRow }: { stripRow: ReactNode }) {
  const { state, meta } = useTimelineContext();
  if (!state.timelineReady) return <Timeline.EmptyState />;
  return (
    <div {...meta.containerProps}>
      <div {...meta.viewportProps}>
        <Timeline.Frame />
        {stripRow}
        <Timeline.RazorGuide />
      </div>
      <Timeline.Overlays />
    </div>
  );
}

interface TimelinePaneProps {
  editCallbacks: TimelineEditCallbacks;
  onSeek: TimelineEditorProps["onSeek"];
  onDeleteElement: TimelineEditorProps["onDeleteElement"];
  renderClipContent: RenderClipContent;
  filmstrip: Filmstrip;
}

/**
 * Memoised like Studio's TimelineComposed: the page re-renders with the
 * playhead clock, and the timeline provider must not re-run with it.
 */
const TimelinePane = memo(function TimelinePane({
  editCallbacks,
  onSeek,
  onDeleteElement,
  renderClipContent,
  filmstrip,
}: TimelinePaneProps) {
  const { cache, root } = filmstrip;
  return (
    <TimelineEditProvider value={editCallbacks}>
      <Timeline.Provider onSeek={onSeek} onDeleteElement={onDeleteElement} renderClipContent={renderClipContent}>
        <TimelineView
          stripRow={
            root ? (
              <SceneStripRow fps={root.fps} aspect={root.aspect} urlFor={root.urlFor} cache={cache} onSeek={onSeek} />
            ) : null
          }
        />
      </Timeline.Provider>
    </TimelineEditProvider>
  );
});

export function TimelineEditor({
  projectId,
  player,
  editCallbacks,
  onSeek,
  onDeleteElement,
  renderClipContent,
  filmstrip,
  transport,
  banner,
  previewOverlay,
  panel,
}: TimelineEditorProps) {
  return (
    <div className="ae-shell">
      {banner}
      <div className="ae-preview">
        {player.previewSlots.map((slot) =>
          slot.role === "live" ? (
            <Player
              key={`${projectId}-${slot.gen}`}
              ref={player.setLiveIframe}
              projectId={projectId}
              onLoad={player.onIframeLoad}
              suppressLoadingOverlay
            />
          ) : (
            <Player
              key={`${projectId}-${slot.gen}`}
              ref={player.setShadowIframe}
              directUrl={slot.url}
              onLoad={() => player.onShadowIframeLoad(slot.gen)}
              onReadyToShowChange={(ready) => player.onShadowReadyChange(slot.gen, ready)}
              onPreviewError={(message) => player.onShadowError(slot.gen, message)}
              suppressLoadingOverlay
              style={SHADOW_STYLE}
            />
          ),
        )}
        {previewOverlay}
        {panel}
      </div>
      {transport}
      <div className="ae-timeline">
        <TimelinePane
          editCallbacks={editCallbacks}
          onSeek={onSeek}
          onDeleteElement={onDeleteElement}
          renderClipContent={renderClipContent}
          filmstrip={filmstrip}
        />
      </div>
    </div>
  );
}
