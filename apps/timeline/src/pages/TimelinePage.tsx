import { ConflictBanner } from "../components/ConflictBanner";
import { TimelineEditor } from "../components/TimelineEditor";
import { TransportControls } from "../components/TransportControls";
import { useHashProjectId } from "../hooks/useHashProjectId";
import { useTimelineEditor } from "../hooks/useTimelineEditor";

export function TimelinePage() {
  const projectId = useHashProjectId();
  const editor = useTimelineEditor(projectId);

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
      banner={
        editor.conflict ? (
          <ConflictBanner
            filePath={editor.conflict.filePath}
            onReload={editor.handleConflictReload}
            onDismiss={editor.handleConflictDismiss}
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
          onToggle={editor.transport.togglePlay}
          onSeek={editor.transport.seek}
          onUndo={() => void editor.history.undo()}
          onRedo={() => void editor.history.redo()}
        />
      }
    />
  );
}
