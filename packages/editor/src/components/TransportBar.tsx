import { Pause, Play } from "lucide-react";
import { Button } from "./ui/button.js";

interface TransportBarProps {
  time: number;
  duration: number | null;
  playing: boolean;
  ready: boolean;
  onToggle: () => void;
  onSeek: (time: number) => void;
}

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export function TransportBar({
  time,
  duration,
  playing,
  ready,
  onToggle,
  onSeek,
}: TransportBarProps) {
  const dur = duration && duration > 0 ? duration : 0;
  const disabled = !ready || dur === 0;

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
      <Button
        size="sm"
        variant="secondary"
        onClick={onToggle}
        disabled={disabled}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        {fmt(time)} <span className="opacity-50">/</span> {fmt(dur)}
      </div>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.01}
        value={Math.min(time, dur || time)}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={disabled}
        className="h-1 flex-1 cursor-pointer accent-primary"
      />
      {!ready ? (
        <span className="text-[10px] text-muted-foreground">no timeline</span>
      ) : null}
    </div>
  );
}
