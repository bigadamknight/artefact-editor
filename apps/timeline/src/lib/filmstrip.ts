/**
 * Filmstrip geometry and thumbnail URLs for the timeline.
 *
 * A filmstrip shows N frames at distinct times, one per tile. Tile spans snap
 * to a power-of-two seconds grid, so every zoom level inside one bucket asks
 * for the same frames and hits the server's thumbnail cache.
 */

/** Studio's clip-thumbnail height (CLIP_HEIGHT in its CompositionThumbnail). */
export const FILMSTRIP_TILE_HEIGHT = 66;

const MIN_TILE_SECONDS = 1 / 16;
const MAX_TILE_SECONDS = 64;

/** The thumbnail route's URL version; the server keys its disk cache on it. */
const THUMBNAIL_URL_VERSION = "v3";

export interface FilmstripTile {
  /** Composition seconds, quantised to the frame rate. */
  t: number;
  /** Left edge of the tile in pixels, from the strip's start. */
  x: number;
}

export interface FilmstripLayout {
  /** Width of one frame at the strip's height and aspect. */
  tileW: number;
  /** Seconds each tile spans; a power of two. */
  tileSeconds: number;
  /** Pixels each tile spans on the timeline (tileSeconds * pps). */
  cellW: number;
  tiles: FilmstripTile[];
}

export interface FilmstripInput {
  /** Strip start in composition seconds (the time of x = 0). */
  start: number;
  duration: number;
  /** Timeline pixels per second. */
  pps: number;
  fps: number;
  tileHeight?: number;
  aspect?: number;
}

function quantise(t: number, fps: number): number {
  return fps > 0 ? Math.round(t * fps) / fps : t;
}

export function filmstripTiles({
  start,
  duration,
  pps,
  fps,
  tileHeight = FILMSTRIP_TILE_HEIGHT,
  aspect = 16 / 9,
}: FilmstripInput): FilmstripLayout {
  const tileW = Math.max(1, Math.round(tileHeight * (aspect > 0 ? aspect : 16 / 9)));
  if (!(pps > 0) || !(duration > 0)) return { tileW, tileSeconds: 0, cellW: 0, tiles: [] };

  const exponent = Math.round(Math.log2(tileW / pps));
  const tileSeconds = Math.min(MAX_TILE_SECONDS, Math.max(MIN_TILE_SECONDS, 2 ** exponent));
  const end = start + duration;
  // The last frame of the strip, so a final partial tile never seeks past it.
  const lastFrame = Math.max(start, end - (fps > 0 ? 1 / fps : 0));
  const count = Math.ceil(duration / tileSeconds);
  const tiles: FilmstripTile[] = [];
  for (let i = 0; i < count; i++) {
    const centre = Math.min(start + (i + 0.5) * tileSeconds, lastFrame);
    tiles.push({ t: quantise(centre, fps), x: i * tileSeconds * pps });
  }
  return { tileW, tileSeconds, cellW: tileSeconds * pps, tiles };
}

export interface ThumbnailUrlOptions {
  t: number;
  selector?: string;
  selectorIndex?: number;
  /** Viewport override. Omit it and the server reads the composition's own size. */
  w?: number;
  h?: number;
  revision?: number;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * The thumbnail route for one frame. Same parameters, in the same order, as
 * Studio's buildCompositionThumbnailUrl. `t` carries two decimals because the
 * server keys its cache on `seekTime.toFixed(2)`.
 */
export function thumbnailUrl(projectId: string, comp: string, options: ThumbnailUrlOptions): string {
  const params = new URLSearchParams();
  params.set("t", options.t.toFixed(2));
  params.set("v", THUMBNAIL_URL_VERSION);
  if (options.w) params.set("w", String(Math.round(options.w)));
  if (options.h) params.set("h", String(Math.round(options.h)));
  params.set("revision", String(options.revision ?? 0));
  if (options.selector) {
    params.set("selector", options.selector);
    if (options.selectorIndex != null && options.selectorIndex > 0) {
      params.set("selectorIndex", String(options.selectorIndex));
    }
  }
  return `/api/projects/${encodeURIComponent(projectId)}/thumbnail/${encodePath(comp)}?${params}`;
}

/** Studio's store key for a composition path (revisionKey in its thumbnailSlice). */
function revisionKey(path: string): string {
  return (path.split(/[?#]/)[0] ?? "").replace(/\\/g, "/").replace(/^\.?\//, "");
}

/** The content revision Studio's thumbnails use for one composition. */
export function thumbnailRevisionOf(
  revisions: Readonly<Record<string, number>>,
  compositionPath: string,
): number {
  return (revisions["*"] ?? 0) + (revisions[revisionKey(compositionPath)] ?? 0);
}

/**
 * The project-relative composition file a sub-composition clip points at.
 * Studio may hand back a full preview URL; strip it to the path.
 */
export function compositionPathOf(compositionSrc: string, projectId: string): string {
  const prefix = `/api/projects/${encodeURIComponent(projectId)}/preview/`;
  try {
    const { pathname } = new URL(compositionSrc, "http://localhost");
    if (pathname.startsWith(prefix)) {
      return decodeURIComponent(pathname.slice(prefix.length)).replace(/^comp\//, "");
    }
  } catch {
    // Not a URL; treat it as a path.
  }
  return revisionKey(compositionSrc);
}
