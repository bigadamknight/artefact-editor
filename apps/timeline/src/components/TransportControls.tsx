import { Layers, LayoutGrid, Pause, Play, Redo2, SkipBack, Undo2 } from "lucide-react";
import { IconButton, formatTime } from "@hyperframes/studio";
import type { TimelineStatus } from "../hooks/useTimelineEditor";

export interface TransportControlsProps {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;
  canUndo: boolean;
  canRedo: boolean;
  status: TimelineStatus;
  onionOn: boolean;
  stripOpen: boolean;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleOnion: () => void;
  onToggleStrip: () => void;
}

export function TransportControls({
  ready,
  playing,
  time,
  duration,
  canUndo,
  canRedo,
  status,
  onionOn,
  stripOpen,
  onToggle,
  onSeek,
  onUndo,
  onRedo,
  onToggleOnion,
  onToggleStrip,
}: TransportControlsProps) {
  return (
    <div className="ae-transport" role="toolbar" aria-label="Playback">
      <IconButton
        size="sm"
        aria-label="Go to start"
        title="Go to start"
        icon={<SkipBack size={14} />}
        disabled={!ready}
        onClick={() => onSeek(0)}
      />
      <IconButton
        size="md"
        variant="secondary"
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        icon={playing ? <Pause size={16} /> : <Play size={16} />}
        disabled={!ready}
        onClick={onToggle}
      />
      <span className="ae-transport__time" aria-live="off">
        {formatTime(time)} / {formatTime(duration)}
      </span>
      <IconButton
        size="sm"
        variant={onionOn ? "secondary" : "ghost"}
        aria-label="Onion skin"
        aria-pressed={onionOn}
        title="Onion skin: blend frames over the preview"
        icon={<Layers size={14} />}
        disabled={!ready}
        onClick={onToggleOnion}
      />
      <IconButton
        size="sm"
        variant={stripOpen ? "secondary" : "ghost"}
        aria-label="Contact sheet"
        aria-pressed={stripOpen}
        title="Contact sheet: a grid of frames"
        icon={<LayoutGrid size={14} />}
        disabled={!ready}
        onClick={onToggleStrip}
      />
      <span className="ae-transport__spacer" />
      {status ? (
        <span className={`ae-transport__status ae-transport__status--${status.tone}`} role="status">
          {status.message}
        </span>
      ) : null}
      <IconButton
        size="sm"
        aria-label="Undo"
        title="Undo (⌘Z)"
        icon={<Undo2 size={14} />}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <IconButton
        size="sm"
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
        icon={<Redo2 size={14} />}
        disabled={!canRedo}
        onClick={onRedo}
      />
    </div>
  );
}
