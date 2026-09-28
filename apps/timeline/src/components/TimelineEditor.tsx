import type { ReactNode } from "react";
import {
  Player,
  Timeline,
  TimelineEditProvider,
  type TimelineClipRenderContext,
  type TimelineEditCallbacks,
  type TimelineElement,
} from "@hyperframes/studio";
import type { TimelineEditorState } from "../hooks/useTimelineEditor";

// Keeps a reloading preview loaded but invisible until it is promoted.
const SHADOW_STYLE = {
  position: "absolute",
  inset: 0,
  visibility: "hidden",
  clipPath: "inset(100%)",
  pointerEvents: "none",
} as const;

export interface TimelineEditorProps {
  projectId: string;
  player: TimelineEditorState["player"];
  editCallbacks: TimelineEditCallbacks;
  onSeek: (time: number, options?: { keepPlaying?: boolean }) => void;
  onDeleteElement: (element: TimelineElement) => Promise<void> | void;
  renderClipContent: (
    element: TimelineElement,
    style: { clip: string; label: string },
    context?: TimelineClipRenderContext,
  ) => ReactNode;
  transport: ReactNode;
  banner: ReactNode;
}

export function TimelineEditor({
  projectId,
  player,
  editCallbacks,
  onSeek,
  onDeleteElement,
  renderClipContent,
  transport,
  banner,
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
      </div>
      {transport}
      <div className="ae-timeline">
        <TimelineEditProvider value={editCallbacks}>
          <Timeline
            onSeek={onSeek}
            onDeleteElement={onDeleteElement}
            renderClipContent={renderClipContent}
          />
        </TimelineEditProvider>
      </div>
    </div>
  );
}
