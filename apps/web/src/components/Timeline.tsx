import { useMemo, useRef, useState, useCallback } from "react";
import type { Block } from "@artefact-editor/core";

interface TimelineProps {
  blocks: Block[];
  selectedBlockId: string | null;
  pendingValues: Map<string, Record<string, string | number>>;
  playheadTime?: number;
  onSelectBlock: (id: string) => void;
  onSetProperty: (blockId: string, key: string, value: number) => void;
  onSeek?: (time: number) => void;
}

interface AudioClip {
  blockId: string;
  label: string;
  start: number;
  duration: number;
}

interface TimingMarker {
  blockId: string;
  label: string;
  value: number;
}

function num(
  block: Block,
  pendingValues: Map<string, Record<string, string | number>>,
  key: string,
): number {
  const pending = pendingValues.get(block.id);
  const raw = pending && key in pending ? pending[key] : block.values[key];
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

const LANE_HEIGHT = 36;
const TRACK_HEADER_W = 120;
const RULER_HEIGHT = 22;
const MARKER_LANE_HEIGHT = 32;
const MIN_DURATION = 0.1;

export function Timeline({
  blocks,
  selectedBlockId,
  pendingValues,
  playheadTime,
  onSelectBlock,
  onSetProperty,
  onSeek,
}: TimelineProps) {
  const [pxPerSec, setPxPerSec] = useState(50);

  const audioClips: AudioClip[] = useMemo(
    () =>
      blocks
        .filter((b) => b.kind === "audio")
        .map((b) => ({
          blockId: b.id,
          label: b.label,
          start: num(b, pendingValues, "data-start"),
          duration: num(b, pendingValues, "data-duration"),
        })),
    [blocks, pendingValues],
  );

  const timingMarkers: TimingMarker[] = useMemo(
    () =>
      blocks
        .filter((b) => b.kind === "timing")
        .map((b) => ({
          blockId: b.id,
          label: b.label,
          value: num(b, pendingValues, "value"),
        })),
    [blocks, pendingValues],
  );

  const compositionDuration = useMemo(() => {
    let max = 10;
    for (const c of audioClips) max = Math.max(max, c.start + c.duration);
    for (const m of timingMarkers) max = Math.max(max, m.value);
    return Math.ceil(max + 2);
  }, [audioClips, timingMarkers]);

  const timelineWidth = compositionDuration * pxPerSec;

  if (audioClips.length === 0 && timingMarkers.length === 0) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline · {compositionDuration}s
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>zoom</span>
          <input
            type="range"
            min={20}
            max={120}
            step={1}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="h-1 w-32 cursor-pointer"
          />
          <span className="w-12 text-right tabular-nums">{pxPerSec} px/s</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ width: TRACK_HEADER_W + timelineWidth }}
        >
          <Ruler
            durationSec={compositionDuration}
            pxPerSec={pxPerSec}
            offset={TRACK_HEADER_W}
          />
          {audioClips.map((clip, i) => (
            <AudioRow
              key={clip.blockId}
              clip={clip}
              rowIndex={i}
              pxPerSec={pxPerSec}
              selected={selectedBlockId === clip.blockId}
              onSelect={() => onSelectBlock(clip.blockId)}
              onMove={(start) => onSetProperty(clip.blockId, "data-start", Math.max(0, round1(start)))}
              onResize={(duration) =>
                onSetProperty(clip.blockId, "data-duration", Math.max(MIN_DURATION, round1(duration)))
              }
            />
          ))}
          <MarkersRow
            markers={timingMarkers}
            rowIndex={audioClips.length}
            pxPerSec={pxPerSec}
            selectedBlockId={selectedBlockId}
            onSelect={onSelectBlock}
            onMove={(blockId, value) =>
              onSetProperty(blockId, "value", Math.max(0, round1(value)))
            }
          />
          {typeof playheadTime === "number" ? (
            <Playhead
              time={playheadTime}
              pxPerSec={pxPerSec}
              totalRows={audioClips.length + (timingMarkers.length > 0 ? 1 : 0)}
              onSeek={onSeek}
              compositionDuration={compositionDuration}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface PlayheadProps {
  time: number;
  pxPerSec: number;
  totalRows: number;
  compositionDuration: number;
  onSeek?: (time: number) => void;
}

function Playhead({ time, pxPerSec, totalRows, compositionDuration, onSeek }: PlayheadProps) {
  const left = TRACK_HEADER_W + Math.max(0, time) * pxPerSec;
  const height = totalRows * LANE_HEIGHT + RULER_HEIGHT;
  const dragRef = useRef<{ startX: number; startTime: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!onSeek) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startTime: time };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!onSeek || !dragRef.current) return;
    const deltaSec = (e.clientX - dragRef.current.startX) / pxPerSec;
    const next = Math.max(0, Math.min(compositionDuration, dragRef.current.startTime + deltaSec));
    onSeek(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute top-0 z-20"
      style={{
        left: left - 6,
        width: 12,
        height,
        cursor: onSeek ? "ew-resize" : "default",
        touchAction: "none",
      }}
    >
      <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-red-500" />
      <div className="absolute left-1/2 top-0 h-2 w-3 -translate-x-1/2 rounded-sm bg-red-500" />
    </div>
  );
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

interface RulerProps {
  durationSec: number;
  pxPerSec: number;
  offset: number;
}

function Ruler({ durationSec, pxPerSec, offset }: RulerProps) {
  const ticks: number[] = [];
  const step = pxPerSec >= 70 ? 1 : pxPerSec >= 40 ? 2 : 5;
  for (let s = 0; s <= durationSec; s += step) ticks.push(s);
  return (
    <div
      className="sticky top-0 z-10 flex border-b border-border bg-muted/60"
      style={{ height: RULER_HEIGHT }}
    >
      <div
        className="shrink-0 border-r border-border"
        style={{ width: offset }}
      />
      <div className="relative" style={{ width: durationSec * pxPerSec, flex: "0 0 auto" }}>
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full border-l border-border/60 text-[10px] tabular-nums text-muted-foreground"
            style={{ left: t * pxPerSec, paddingLeft: 4 }}
          >
            {t}s
          </div>
        ))}
      </div>
    </div>
  );
}

interface AudioRowProps {
  clip: AudioClip;
  rowIndex: number;
  pxPerSec: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (start: number) => void;
  onResize: (duration: number) => void;
}

function AudioRow({
  clip,
  rowIndex,
  pxPerSec,
  selected,
  onSelect,
  onMove,
  onResize,
}: AudioRowProps) {
  const top = RULER_HEIGHT + rowIndex * LANE_HEIGHT;
  const left = TRACK_HEADER_W + clip.start * pxPerSec;
  const width = Math.max(clip.duration * pxPerSec, 12);

  const dragRef = useRef<{ kind: "move" | "resize"; startX: number; startStart: number; startDuration: number } | null>(null);

  const handlePointerDown = useCallback(
    (kind: "move" | "resize") => (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        kind,
        startX: e.clientX,
        startStart: clip.start,
        startDuration: clip.duration,
      };
    },
    [clip.start, clip.duration, onSelect],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaSec = (e.clientX - d.startX) / pxPerSec;
      if (d.kind === "move") {
        onMove(d.startStart + deltaSec);
      } else {
        onResize(d.startDuration + deltaSec);
      }
    },
    [pxPerSec, onMove, onResize],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  return (
    <>
      <div
        className="absolute left-0 flex items-center border-b border-border bg-background px-3 text-xs font-medium"
        style={{ top, height: LANE_HEIGHT, width: TRACK_HEADER_W }}
      >
        <span className="truncate">{clip.label}</span>
      </div>
      <div
        className="absolute border-b border-border"
        style={{
          top,
          height: LANE_HEIGHT,
          left: TRACK_HEADER_W,
          right: 0,
          background: rowIndex % 2 === 0 ? "transparent" : "hsl(210 40% 98%)",
        }}
      />
      <div
        onPointerDown={handlePointerDown("move")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={[
          "absolute flex cursor-grab items-center rounded-md text-[11px] font-medium text-white shadow-sm",
          selected ? "ring-2 ring-primary" : "",
        ].join(" ")}
        style={{
          top: top + 4,
          left,
          width,
          height: LANE_HEIGHT - 8,
          background: "linear-gradient(90deg, hsl(217 91% 60%), hsl(199 89% 48%))",
          touchAction: "none",
        }}
      >
        <span className="pointer-events-none truncate px-2">
          {clip.label} · {clip.start.toFixed(1)}s → {(clip.start + clip.duration).toFixed(1)}s
        </span>
        <div
          onPointerDown={handlePointerDown("resize")}
          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/20 hover:bg-black/40"
          style={{ touchAction: "none" }}
        />
      </div>
    </>
  );
}

interface MarkersRowProps {
  markers: TimingMarker[];
  rowIndex: number;
  pxPerSec: number;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onMove: (blockId: string, value: number) => void;
}

function MarkersRow({
  markers,
  rowIndex,
  pxPerSec,
  selectedBlockId,
  onSelect,
  onMove,
}: MarkersRowProps) {
  const top = RULER_HEIGHT + rowIndex * LANE_HEIGHT;
  if (markers.length === 0) return null;

  return (
    <>
      <div
        className="absolute left-0 flex items-center border-b border-border bg-background px-3 text-xs font-medium"
        style={{ top, height: MARKER_LANE_HEIGHT, width: TRACK_HEADER_W }}
      >
        Scene-times
      </div>
      <div
        className="absolute border-b border-border"
        style={{
          top,
          height: MARKER_LANE_HEIGHT,
          left: TRACK_HEADER_W,
          right: 0,
          background: "hsl(210 40% 98%)",
        }}
      />
      {markers.map((m) => (
        <Marker
          key={m.blockId}
          marker={m}
          rowTop={top}
          pxPerSec={pxPerSec}
          selected={selectedBlockId === m.blockId}
          onSelect={() => onSelect(m.blockId)}
          onMove={(value) => onMove(m.blockId, value)}
        />
      ))}
    </>
  );
}

interface MarkerProps {
  marker: TimingMarker;
  rowTop: number;
  pxPerSec: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (value: number) => void;
}

function Marker({ marker, rowTop, pxPerSec, selected, onSelect, onMove }: MarkerProps) {
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);
  const left = TRACK_HEADER_W + marker.value * pxPerSec;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startValue: marker.value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaSec = (e.clientX - d.startX) / pxPerSec;
    onMove(d.startValue + deltaSec);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const labelShort = marker.label.split(" — ")[0] ?? marker.label;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={[
        "absolute flex cursor-ew-resize select-none items-start justify-start text-[10px] font-semibold",
        selected ? "z-10" : "",
      ].join(" ")}
      style={{
        top: rowTop,
        left,
        height: MARKER_LANE_HEIGHT,
        width: 12,
        marginLeft: -6,
        touchAction: "none",
      }}
    >
      <div
        className={[
          "h-full w-[2px]",
          selected ? "bg-primary" : "bg-amber-500",
        ].join(" ")}
        style={{ marginLeft: 5 }}
      />
      <div
        className={[
          "absolute top-1 left-2 rounded px-1.5 py-0.5 text-white",
          selected ? "bg-primary" : "bg-amber-600",
        ].join(" ")}
        style={{ whiteSpace: "nowrap" }}
      >
        {labelShort} · {marker.value.toFixed(1)}s
      </div>
    </div>
  );
}
