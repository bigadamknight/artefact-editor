import { usePlayerStore, useTimelineContext } from "@hyperframes/studio";
import { FILMSTRIP_TILE_HEIGHT, filmstripTiles } from "../lib/filmstrip";
import type { ThumbnailCache } from "../lib/thumbnailCache";
import { SceneFilmstrip } from "./SceneFilmstrip";

export interface SceneStripRowProps {
  fps: number;
  aspect: number;
  urlFor: (t: number) => string;
  cache: ThumbnailCache;
  onSeek: (time: number) => void;
}

/**
 * Frames of the whole root composition, pinned under the lanes. Projects
 * animated by script alone have no timed clips, so this row is what shows
 * them. Lives inside the timeline provider and shares the lanes' zoom and
 * horizontal scroll.
 */
export function SceneStripRow({ fps, aspect, urlFor, cache, onSeek }: SceneStripRowProps) {
  const { pps, contentOrigin, trackContentWidth, visibleTimeRange } = useTimelineContext().state.canvas;
  const duration = usePlayerStore((s) => s.duration);
  const layout = filmstripTiles({ start: 0, duration, pps, fps, aspect });
  if (layout.tiles.length === 0) return null;

  return (
    <div
      className="ae-strip-row"
      role="group"
      aria-label="Composition frames"
      style={{ width: contentOrigin + trackContentWidth, height: FILMSTRIP_TILE_HEIGHT }}
    >
      <div
        className="ae-strip-row__frames"
        style={{ left: contentOrigin, width: Math.min(trackContentWidth, duration * pps) }}
      >
        <SceneFilmstrip
          tiles={layout.tiles}
          tileSeconds={layout.tileSeconds}
          cellW={layout.cellW}
          tileH={FILMSTRIP_TILE_HEIGHT}
          urlFor={urlFor}
          cache={cache}
          visibleFrom={visibleTimeRange.start}
          visibleTo={visibleTimeRange.end}
          label="Composition"
          onSelectTile={onSeek}
        />
      </div>
    </div>
  );
}
