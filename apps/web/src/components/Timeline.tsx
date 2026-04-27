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

const LANE_HEIGHT = 28;
const TRACK_HEADER_W = 160;
const RULER_HEIGHT = 22;
const MIN_DURATION = 0.1;

function sceneFromBlockId(id: string): number | null {
  const m = /^blk_s(\d+)_/.exec(id);
  return m ? parseInt(m[1]!, 10) : null;
}

function tIndexFromVarName(name: string): number | null {
  const m = /^T(\d+)$/.exec(name);
  return m ? parseInt(m[1]!, 10) : null;
}

interface Row {
  kind: "audio" | "timing" | "visibility";
  block: Block;
  // audio
  start?: number;
  duration?: number;
  // timing
  value?: number;
  // visibility
  visStart?: number;
  visEnd?: number;
}

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

  // Compute scene → [start, end] from timing blocks.
  const sceneRanges = useMemo(() => {
    const timings = blocks
      .filter((b) => b.kind === "timing" && b.source.tag === "astVar")
      .map((b) => {
        const varName = b.source.tag === "astVar" ? b.source.varName : "";
        const idx = tIndexFromVarName(varName);
        return { idx, value: num(b, pendingValues, "value") };
      })
      .filter((t): t is { idx: number; value: number } => t.idx != null)
      .sort((a, b) => a.idx - b.idx);
    const ranges = new Map<number, [number, number]>();
    let prev = 0;
    for (const t of timings) {
      // Convention: T_N marks the end of scene N.
      ranges.set(t.idx, [prev, t.value]);
      prev = t.value;
    }
    // Following scene runs to end (caller clamps to compositionDuration).
    const next = (timings[timings.length - 1]?.idx ?? 0) + 1;
    ranges.set(next, [prev, Number.POSITIVE_INFINITY]);
    return ranges;
  }, [blocks, pendingValues]);

  const compositionDuration = useMemo(() => {
    let max = 10;
    for (const b of blocks) {
      if (b.kind === "audio") {
        max = Math.max(max, num(b, pendingValues, "data-start") + num(b, pendingValues, "data-duration"));
      } else if (b.kind === "timing") {
        max = Math.max(max, num(b, pendingValues, "value"));
      }
    }
    return Math.ceil(max + 2);
  }, [blocks, pendingValues]);

  // Build one row per editable block, grouped by track type.
  const rows: Row[] = useMemo(() => {
    const audio: Row[] = [];
    const timing: Row[] = [];
    const visibility: Row[] = [];
    for (const b of blocks) {
      if (b.kind === "audio") {
        audio.push({
          kind: "audio",
          block: b,
          start: num(b, pendingValues, "data-start"),
          duration: num(b, pendingValues, "data-duration"),
        });
      } else if (b.kind === "timing") {
        timing.push({ kind: "timing", block: b, value: num(b, pendingValues, "value") });
      } else if (b.kind === "text" || b.kind === "image") {
        const scene = sceneFromBlockId(b.id);
        const range = scene != null ? sceneRanges.get(scene) : null;
        const [s, e] = range ?? [0, Number.POSITIVE_INFINITY];
        visibility.push({
          kind: "visibility",
          block: b,
          visStart: s,
          visEnd: Math.min(e, compositionDuration),
        });
      }
    }
    return [...audio, ...timing, ...visibility];
  }, [blocks, pendingValues, sceneRanges, compositionDuration]);

  const timelineWidth = compositionDuration * pxPerSec;

  if (rows.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline · {compositionDuration}s · {rows.length} tracks
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
        <div className="relative" style={{ width: TRACK_HEADER_W + timelineWidth }}>
          <Ruler durationSec={compositionDuration} pxPerSec={pxPerSec} offset={TRACK_HEADER_W} />
          {rows.map((row, i) => (
            <TrackRow
              key={row.block.id}
              row={row}
              rowIndex={i}
              pxPerSec={pxPerSec}
              compositionDuration={compositionDuration}
              selected={selectedBlockId === row.block.id}
              onSelect={() => onSelectBlock(row.block.id)}
              onSetProperty={onSetProperty}
            />
          ))}
          {typeof playheadTime === "number" ? (
            <Playhead
              time={playheadTime}
              pxPerSec={pxPerSec}
              totalRows={rows.length}
              onSeek={onSeek}
              compositionDuration={compositionDuration}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

interface TrackRowProps {
  row: Row;
  rowIndex: number;
  pxPerSec: number;
  compositionDuration: number;
  selected: boolean;
  onSelect: () => void;
  onSetProperty: (blockId: string, key: string, value: number) => void;
}

function TrackRow({
  row,
  rowIndex,
  pxPerSec,
  compositionDuration,
  selected,
  onSelect,
  onSetProperty,
}: TrackRowProps) {
  const top = RULER_HEIGHT + rowIndex * LANE_HEIGHT;
  const kindBadge = row.kind === "audio" ? "AUD" : row.kind === "timing" ? "T" : row.block.kind === "image" ? "IMG" : "TXT";
  const badgeColor =
    row.kind === "audio"
      ? "bg-sky-100 text-sky-700"
      : row.kind === "timing"
        ? "bg-amber-100 text-amber-700"
        : row.block.kind === "image"
          ? "bg-purple-100 text-purple-700"
          : "bg-slate-100 text-slate-700";

  return (
    <>
      {/* Header column */}
      <div
        onClick={onSelect}
        className={[
          "absolute left-0 flex cursor-pointer items-center gap-2 border-b border-border px-3 text-[11px]",
          selected ? "bg-muted" : "bg-background hover:bg-muted/50",
        ].join(" ")}
        style={{ top, height: LANE_HEIGHT, width: TRACK_HEADER_W }}
      >
        <span
          className={`shrink-0 rounded px-1 py-[1px] text-[9px] font-bold uppercase ${badgeColor}`}
        >
          {kindBadge}
        </span>
        <span className="truncate" title={row.block.label}>
          {row.block.label}
        </span>
      </div>
      {/* Lane background */}
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
      {/* Lane content */}
      {row.kind === "audio" ? (
        <AudioBar
          top={top}
          start={row.start!}
          duration={row.duration!}
          pxPerSec={pxPerSec}
          selected={selected}
          onSelect={onSelect}
          onMove={(s) => onSetProperty(row.block.id, "data-start", Math.max(0, round1(s)))}
          onResize={(d) =>
            onSetProperty(row.block.id, "data-duration", Math.max(MIN_DURATION, round1(d)))
          }
          label={row.block.label}
        />
      ) : null}
      {row.kind === "timing" ? (
        <TimingMark
          top={top}
          value={row.value!}
          pxPerSec={pxPerSec}
          selected={selected}
          label={row.block.label}
          onSelect={onSelect}
          onMove={(v) => onSetProperty(row.block.id, "value", Math.max(0, round1(v)))}
        />
      ) : null}
      {row.kind === "visibility" ? (
        <VisibilityBar
          top={top}
          start={row.visStart!}
          end={Math.min(row.visEnd!, compositionDuration)}
          pxPerSec={pxPerSec}
          selected={selected}
          onSelect={onSelect}
        />
      ) : null}
    </>
  );
}

interface AudioBarProps {
  top: number;
  start: number;
  duration: number;
  pxPerSec: number;
  selected: boolean;
  label: string;
  onSelect: () => void;
  onMove: (start: number) => void;
  onResize: (duration: number) => void;
}

function AudioBar({ top, start, duration, pxPerSec, selected, label, onSelect, onMove, onResize }: AudioBarProps) {
  const left = TRACK_HEADER_W + start * pxPerSec;
  const width = Math.max(duration * pxPerSec, 12);
  const dragRef = useRef<{ kind: "move" | "resize"; startX: number; startStart: number; startDuration: number } | null>(null);

  const handlePointerDown = useCallback(
    (kind: "move" | "resize") => (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { kind, startX: e.clientX, startStart: start, startDuration: duration };
    },
    [start, duration, onSelect],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaSec = (e.clientX - d.startX) / pxPerSec;
      if (d.kind === "move") onMove(d.startStart + deltaSec);
      else onResize(d.startDuration + deltaSec);
    },
    [pxPerSec, onMove, onResize],
  );
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  return (
    <div
      onPointerDown={handlePointerDown("move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={[
        "absolute flex cursor-grab items-center rounded text-[10px] font-medium text-white shadow-sm",
        selected ? "ring-2 ring-primary" : "",
      ].join(" ")}
      style={{
        top: top + 3,
        left,
        width,
        height: LANE_HEIGHT - 6,
        background: "linear-gradient(90deg, hsl(217 91% 60%), hsl(199 89% 48%))",
        touchAction: "none",
      }}
    >
      <span className="pointer-events-none truncate px-1.5">
        {start.toFixed(1)}s → {(start + duration).toFixed(1)}s
      </span>
      <div
        onPointerDown={handlePointerDown("resize")}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-black/20 hover:bg-black/40"
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

interface TimingMarkProps {
  top: number;
  value: number;
  pxPerSec: number;
  selected: boolean;
  label: string;
  onSelect: () => void;
  onMove: (value: number) => void;
}

function TimingMark({ top, value, pxPerSec, selected, onSelect, onMove }: TimingMarkProps) {
  const left = TRACK_HEADER_W + value * pxPerSec;
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startValue: value };
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
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute flex cursor-ew-resize select-none"
      style={{ top, left: left - 6, width: 12, height: LANE_HEIGHT, touchAction: "none" }}
    >
      <div
        className={["mx-auto h-full w-[2px]", selected ? "bg-primary" : "bg-amber-500"].join(" ")}
      />
      <div
        className={[
          "absolute left-3 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white",
          selected ? "bg-primary" : "bg-amber-600",
        ].join(" ")}
        style={{ whiteSpace: "nowrap" }}
      >
        {value.toFixed(1)}s
      </div>
    </div>
  );
}

interface VisibilityBarProps {
  top: number;
  start: number;
  end: number;
  pxPerSec: number;
  selected: boolean;
  onSelect: () => void;
}

function VisibilityBar({ top, start, end, pxPerSec, selected, onSelect }: VisibilityBarProps) {
  const left = TRACK_HEADER_W + start * pxPerSec;
  const width = Math.max((end - start) * pxPerSec, 4);
  return (
    <div
      onClick={onSelect}
      className={[
        "absolute cursor-pointer rounded-sm",
        selected ? "ring-2 ring-primary" : "",
      ].join(" ")}
      style={{
        top: top + 6,
        left,
        width,
        height: LANE_HEIGHT - 12,
        background: selected ? "hsl(217 91% 60% / 0.35)" : "hsl(217 91% 60% / 0.18)",
        border: "1px solid hsl(217 91% 60% / 0.4)",
      }}
      title={`${start.toFixed(1)}s → ${end.toFixed(1)}s`}
    />
  );
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
      <div className="shrink-0 border-r border-border" style={{ width: offset }} />
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
