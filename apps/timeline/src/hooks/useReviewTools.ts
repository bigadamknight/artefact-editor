import { useState } from "react";
import { usePlayerStore, type TimelineElement } from "@hyperframes/studio";
import { thumbnailRevisionOf } from "../lib/filmstrip";
import { useSettledValue } from "./useSettledValue";

export const ONION_COUNT_MIN = 3;
export const ONION_COUNT_MAX = 12;
export const STRIP_COUNT_MIN = 1;
export const STRIP_COUNT_MAX = 64;
export const STRIP_COLUMNS_MIN = 1;
export const STRIP_COLUMNS_MAX = 8;

/** Half the window reviewed around the playhead when nothing is selected. */
const PLAYHEAD_HALF_WINDOW = 0.5;
/** How long the playhead must rest before the review images follow it. */
export const PLAYHEAD_SETTLE_MS = 150;
const ROOT_COMPOSITION = "index.html";

export type ReviewRangeSource = "selection" | "range" | "playhead";

export interface ReviewRange {
  from: number;
  to: number;
  source: ReviewRangeSource;
}

export interface ReviewRangeInput {
  selected: Pick<TimelineElement, "start" | "duration"> | null;
  rangeSelection: { t0: number; t1: number } | null;
  time: number;
  duration: number;
}

const round2 = (t: number) => Math.round(t * 100) / 100;
const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

function clampRange(from: number, to: number, duration: number, source: ReviewRangeSource): ReviewRange | null {
  const end = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  const lo = round2(Math.min(end, Math.max(0, from)));
  const hi = round2(Math.min(end, Math.max(0, to)));
  return lo < hi ? { from: lo, to: hi, source } : null;
}

/** The selected clip, else the ruler range, else a second around the playhead. */
export function reviewRange({ selected, rangeSelection, time, duration }: ReviewRangeInput): ReviewRange | null {
  if (selected && selected.duration > 0) {
    const range = clampRange(selected.start, selected.start + selected.duration, duration, "selection");
    if (range) return range;
  }
  if (rangeSelection && rangeSelection.t1 > rangeSelection.t0) {
    const range = clampRange(rangeSelection.t0, rangeSelection.t1, duration, "range");
    if (range) return range;
  }
  return clampRange(time - PLAYHEAD_HALF_WINDOW, time + PLAYHEAD_HALF_WINDOW, duration, "playhead");
}

const SOURCE_LABEL: Record<ReviewRangeSource, string> = {
  selection: "Selected clip",
  range: "Range",
  playhead: "Around playhead",
};

function formatRange(range: ReviewRange): string {
  return `${SOURCE_LABEL[range.source]} · ${range.from.toFixed(2)}–${range.to.toFixed(2)} s`;
}

function reviewUrl(projectId: string, route: "onion" | "strip", params: Record<string, number>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return `/api/projects/${encodeURIComponent(projectId)}/${route}?${query}`;
}

function selectedElementOf(elements: readonly TimelineElement[], id: string | null): TimelineElement | null {
  if (!id) return null;
  return elements.find((element) => (element.key ?? element.id) === id) ?? null;
}

/**
 * The onion-skin overlay and the contact-sheet panel: their settings, the
 * range they review, and the image URLs. The range is derived on each render
 * from the selection, the ruler range or the playhead; it is never stored.
 */
export function useReviewTools(projectId: string | null) {
  const [onion, setOnion] = useState({ on: false, n: 6 });
  const [strip, setStrip] = useState({ open: false, n: 12, columns: 4 });

  const elements = usePlayerStore((s) => s.elements);
  const selectedElementId = usePlayerStore((s) => s.selectedElementId);
  const rangeSelection = usePlayerStore((s) => s.rangeSelection);
  // The store's playhead moves on seek and pause, not every frame of playback,
  // but a scrub seeks on every pointer move; each new range is a server capture.
  const time = useSettledValue(usePlayerStore((s) => s.currentTime), PLAYHEAD_SETTLE_MS);
  const duration = usePlayerStore((s) => s.duration);
  const revision = usePlayerStore((s) => thumbnailRevisionOf(s.thumbnailRevisions, ROOT_COMPOSITION));

  const range = reviewRange({
    selected: selectedElementOf(elements, selectedElementId),
    rangeSelection,
    time,
    duration,
  });

  const onionUrl =
    projectId && onion.on && range
      ? reviewUrl(projectId, "onion", { from: range.from, to: range.to, n: onion.n, revision })
      : null;
  const stripUrl =
    projectId && strip.open && range
      ? reviewUrl(projectId, "strip", {
          from: range.from,
          to: range.to,
          n: strip.n,
          columns: strip.columns,
          revision,
        })
      : null;

  const handleToggleOnion = () => setOnion((prev) => ({ ...prev, on: !prev.on }));
  const handleSetOnionCount = (n: number) =>
    setOnion((prev) => ({ ...prev, n: clampInt(n, ONION_COUNT_MIN, ONION_COUNT_MAX) }));
  const handleOpenStrip = () => setStrip((prev) => ({ ...prev, open: true }));
  const handleCloseStrip = () => setStrip((prev) => ({ ...prev, open: false }));
  const handleSetStripCount = (n: number) =>
    setStrip((prev) => ({ ...prev, n: clampInt(n, STRIP_COUNT_MIN, STRIP_COUNT_MAX) }));
  const handleSetStripColumns = (columns: number) =>
    setStrip((prev) => ({ ...prev, columns: clampInt(columns, STRIP_COLUMNS_MIN, STRIP_COLUMNS_MAX) }));

  const absoluteStripUrl = stripUrl ? new URL(stripUrl, window.location.origin).href : null;
  const handleOpenStripImage = () => {
    if (absoluteStripUrl) window.open(absoluteStripUrl, "_blank", "noopener");
  };
  const handleCopyStripUrl = () => {
    if (absoluteStripUrl) void navigator.clipboard?.writeText(absoluteStripUrl).catch(() => {});
  };

  return {
    onion,
    strip,
    range,
    rangeLabel: range ? formatRange(range) : "No range",
    onionUrl,
    stripUrl,
    handleToggleOnion,
    handleSetOnionCount,
    handleOpenStrip,
    handleCloseStrip,
    handleSetStripCount,
    handleSetStripColumns,
    handleOpenStripImage,
    handleCopyStripUrl,
  };
}

export type ReviewToolsState = ReturnType<typeof useReviewTools>;
