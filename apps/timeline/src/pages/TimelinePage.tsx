import { ConflictBanner } from "../components/ConflictBanner";
import { ContactSheetPanel } from "../components/ContactSheetPanel";
import { OnionOverlay } from "../components/OnionOverlay";
import { TimelineEditor } from "../components/TimelineEditor";
import { TransportControls } from "../components/TransportControls";
import { useHashProjectId } from "../hooks/useHashProjectId";
import { useReviewTools } from "../hooks/useReviewTools";
import { useTimelineEditor } from "../hooks/useTimelineEditor";

export function TimelinePage() {
  const projectId = useHashProjectId();
  const editor = useTimelineEditor(projectId);
  const review = useReviewTools(projectId);

  if (!projectId) {
    return <div className="ae-empty">No project selected.</div>;
  }

  return (
    <TimelineEditor
      projectId={projectId}
      player={editor.player}
      editCallbacks={editor.editCallbacks}
      onSeek={editor.transport.seek}
      onDeleteElement={editor.handleDeleteElement}
      renderClipContent={editor.renderClipContent}
      filmstrip={editor.filmstrip}
      banner={
        editor.conflict ? (
          <ConflictBanner
            filePath={editor.conflict.filePath}
            onReload={editor.handleConflictReload}
            onDismiss={editor.handleConflictDismiss}
          />
        ) : null
      }
      previewOverlay={
        review.onionUrl ? (
          <OnionOverlay
            src={review.onionUrl}
            iframe={editor.player.liveIframe}
            n={review.onion.n}
            onSetCount={review.handleSetOnionCount}
            onClose={review.handleToggleOnion}
          />
        ) : null
      }
      panel={
        review.stripUrl ? (
          <ContactSheetPanel
            src={review.stripUrl}
            n={review.strip.n}
            columns={review.strip.columns}
            rangeLabel={review.rangeLabel}
            onSetCount={review.handleSetStripCount}
            onSetColumns={review.handleSetStripColumns}
            onOpenImage={review.handleOpenStripImage}
            onCopyUrl={review.handleCopyStripUrl}
            onClose={review.handleCloseStrip}
          />
        ) : null
      }
      transport={
        <TransportControls
          ready={editor.transport.ready}
          playing={editor.transport.playing}
          time={editor.transport.time}
          duration={editor.transport.duration}
          canUndo={editor.history.canUndo}
          canRedo={editor.history.canRedo}
          status={editor.status}
          onionOn={review.onion.on}
          stripOpen={review.strip.open}
          onToggle={editor.transport.togglePlay}
          onSeek={editor.transport.seek}
          onUndo={() => void editor.history.undo()}
          onRedo={() => void editor.history.redo()}
          onToggleOnion={review.handleToggleOnion}
          onToggleStrip={review.strip.open ? review.handleCloseStrip : review.handleOpenStrip}
        />
      }
    />
  );
}
