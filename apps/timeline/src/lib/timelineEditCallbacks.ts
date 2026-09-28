/*
 * Adapted from HyperFrames Studio (@hyperframes/studio 0.8.81):
 *   packages/studio/src/components/nle/useTimelineEditCallbacks.ts
 *   packages/studio/src/hooks/timelineMoveAdapter.ts
 * https://github.com/heygen-com/hyperframes
 * Copyright 2026 HeyGen, Inc. Licensed under the Apache License, Version 2.0.
 * See packages/adapter-hyperframes/LICENSE.hyperframes.
 *
 * Changes: only the move, resize, split and track-visibility entries are
 * kept. Studio's version also wires keyframe and audio-FX callbacks through
 * its DOM-edit context, which this host does not mount. Rewritten as a plain
 * function over the useTimelineEditing() result.
 */
import type { TimelineEditCallbacks, useTimelineEditing } from "@hyperframes/studio";

type TimelineEditing = Pick<
  ReturnType<typeof useTimelineEditing>,
  | "handleTimelineElementMove"
  | "handleTimelineGroupMove"
  | "handleTimelineElementResize"
  | "handleTimelineGroupResize"
  | "handleToggleTrackHidden"
  | "handleBlockedTimelineEdit"
  | "handleTimelineElementSplit"
  | "handleRazorSplit"
  | "handleRazorSplitAll"
>;

type MoveEdits = NonNullable<TimelineEditCallbacks["onMoveElements"]>;

/**
 * Maps the handlers returned by Studio's useTimelineEditing() onto the
 * callback names <Timeline> reads from TimelineEditProvider.
 */
export function buildTimelineEditCallbacks(editing: TimelineEditing): TimelineEditCallbacks {
  const onMoveElements: MoveEdits = (edits, coalesceKey, operation = "timing", coalesceMs) =>
    // One write for the whole gesture, so one undo step. A plain horizontal
    // move ("timing") leaves the track out; lane moves persist it.
    editing.handleTimelineGroupMove(
      edits.map(({ element, updates }) => ({
        element,
        start: updates.start,
        track: operation === "timing" ? undefined : updates.track,
      })),
      { coalesceKey, coalesceMs },
    );

  return {
    onMoveElement: editing.handleTimelineElementMove,
    onMoveElements,
    onResizeElement: editing.handleTimelineElementResize,
    onResizeElements: editing.handleTimelineGroupResize,
    onToggleTrackHidden: editing.handleToggleTrackHidden,
    onBlockedEditAttempt: editing.handleBlockedTimelineEdit,
    onSplitElement: editing.handleTimelineElementSplit,
    onRazorSplit: editing.handleRazorSplit,
    onRazorSplitAll: editing.handleRazorSplitAll,
  };
}
