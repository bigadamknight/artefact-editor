import { useEffect, useState } from "react";
import type { FilmstripTile } from "../lib/filmstrip";
import type { ThumbnailCache } from "../lib/thumbnailCache";

export interface SceneFilmstripProps {
  tiles: readonly FilmstripTile[];
  /** Seconds each tile spans. */
  tileSeconds: number;
  /** Pixels each tile spans. */
  cellW: number;
  /** Tile height in pixels; omitted, tiles fill the container. */
  tileH?: number;
  urlFor: (t: number) => string;
  cache: ThumbnailCache;
  /** The visible window, in the same seconds as the tiles' `t`. */
  visibleFrom: number;
  visibleTo: number;
  label?: string;
  labelColor?: string;
  /** Makes each tile a button that reports its time. */
  onSelectTile?: (t: number) => void;
}

/**
 * A row of frames at distinct times. Only tiles within the visible window,
 * plus one tile either side, are mounted, so only those are requested.
 */
export function SceneFilmstrip({
  tiles,
  tileSeconds,
  cellW,
  tileH,
  urlFor,
  cache,
  visibleFrom,
  visibleTo,
  label,
  labelColor,
  onSelectTile,
}: SceneFilmstripProps) {
  const from = visibleFrom - tileSeconds;
  const to = visibleTo + tileSeconds;
  return (
    <div className="ae-filmstrip">
      {tiles
        .filter((tile) => tile.t >= from && tile.t <= to)
        .map((tile) => (
          <FilmstripTileView
            key={tile.x}
            url={urlFor(tile.t)}
            cache={cache}
            x={tile.x}
            width={cellW}
            height={tileH}
            onSelect={onSelectTile ? () => onSelectTile(tile.t) : undefined}
            seconds={tile.t}
          />
        ))}
      {label ? (
        <span className="ae-filmstrip__label" style={{ color: labelColor }}>
          {label}
        </span>
      ) : null}
    </div>
  );
}

interface FilmstripTileViewProps {
  url: string;
  cache: ThumbnailCache;
  x: number;
  width: number;
  height?: number;
  seconds: number;
  onSelect?: () => void;
}

type Loaded = { url: string; src: string | null };

function FilmstripTileView({ url, cache, x, width, height, seconds, onSelect }: FilmstripTileViewProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // A cached URL resolves at once; asking anyway refreshes its recency.
  useEffect(() => {
    const controller = new AbortController();
    cache.get(url, controller.signal).then(
      (src) => setLoaded({ url, src }),
      () => {
        if (!controller.signal.aborted) setLoaded({ url, src: null });
      },
    );
    return () => controller.abort();
  }, [url]);

  // A cached frame paints on first render, with no placeholder flash.
  const src = loaded?.url === url ? loaded.src : cache.peek(url);
  const style = { left: x, width, height };
  const body =
    src === undefined ? (
      <span className="ae-filmstrip__pending" />
    ) : src === null ? (
      <span className="ae-filmstrip__missing" />
    ) : (
      <img className="ae-filmstrip__img" src={src} alt="" draggable={false} />
    );

  if (!onSelect) {
    return (
      <div className="ae-filmstrip__tile" style={style}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="ae-filmstrip__tile ae-filmstrip__tile--button"
      style={style}
      aria-label={`Go to ${seconds.toFixed(2)} s`}
      onClick={onSelect}
    >
      {body}
    </button>
  );
}
