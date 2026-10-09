import { useTimelineContext } from "@hyperframes/studio";
import { filmstripTiles } from "../lib/filmstrip";
import type { ThumbnailCache } from "../lib/thumbnailCache";
import { SceneFilmstrip } from "./SceneFilmstrip";

export interface ClipFilmstripProps {
  /** Where the clip sits on the timeline, in root seconds. */
  clipStart: number;
  duration: number;
  /** The time of the clip's first frame in its own composition: 0 for a sub-composition. */
  localStart: number;
  fps: number;
  aspect: number;
  urlFor: (t: number) => string;
  cache: ThumbnailCache;
}

/**
 * The frames of one HTML clip. Rendered by the timeline's clip renderer, so it
 * sits inside the timeline provider and follows its zoom and scroll.
 */
export function ClipFilmstrip({
  clipStart,
  duration,
  localStart,
  fps,
  aspect,
  urlFor,
  cache,
}: ClipFilmstripProps) {
  const { pps, visibleTimeRange } = useTimelineContext().state.canvas;
  const layout = filmstripTiles({ start: localStart, duration, pps, fps, aspect });
  const offset = localStart - clipStart;
  return (
    <SceneFilmstrip
      tiles={layout.tiles}
      tileSeconds={layout.tileSeconds}
      cellW={layout.cellW}
      urlFor={urlFor}
      cache={cache}
      visibleFrom={visibleTimeRange.start + offset}
      visibleTo={visibleTimeRange.end + offset}
    />
  );
}
