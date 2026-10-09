import { describe, expect, it } from "vitest";
import { compositionPathOf, filmstripTiles, thumbnailRevisionOf, thumbnailUrl } from "./filmstrip";

const BASE = { start: 0, duration: 14.52, fps: 30, aspect: 16 / 9 };

describe("filmstripTiles", () => {
  it("adds tiles as the timeline zooms in", () => {
    const counts = [10, 40, 160, 640].map((pps) => filmstripTiles({ ...BASE, pps }).tiles.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!);
  });

  it("spans each tile over a power-of-two number of seconds", () => {
    for (const pps of [3, 10, 37, 100, 333, 1200, 9000]) {
      const { tileSeconds } = filmstripTiles({ ...BASE, pps });
      expect(Number.isInteger(Math.log2(tileSeconds))).toBe(true);
      expect(tileSeconds).toBeGreaterThanOrEqual(1 / 16);
      expect(tileSeconds).toBeLessThanOrEqual(64);
    }
  });

  it("asks for the same frames at every zoom inside one bucket", () => {
    // tileW = round(66 * 16/9) = 117; both give 2^round(log2(117/pps)) = 1 s.
    const urls = (pps: number) =>
      filmstripTiles({ ...BASE, pps }).tiles.map((tile) =>
        thumbnailUrl("sample", "index.html", { t: tile.t, revision: 0 }),
      );
    const a = filmstripTiles({ ...BASE, pps: 100 });
    const b = filmstripTiles({ ...BASE, pps: 130 });
    expect(a.tileSeconds).toBe(b.tileSeconds);
    expect(urls(100)).toEqual(urls(130));
    expect(urls(100)).not.toEqual(urls(300));
  });

  it("puts tile times on frame boundaries, within the strip", () => {
    for (const fps of [24, 25, 30, 60]) {
      const { tiles } = filmstripTiles({ start: 4.24, duration: 2.44, pps: 900, fps, aspect: 16 / 9 });
      expect(tiles.length).toBeGreaterThan(1);
      for (const { t } of tiles) {
        expect(Math.abs(t * fps - Math.round(t * fps))).toBeLessThan(1e-9);
        expect(t).toBeGreaterThanOrEqual(4.24);
        expect(t).toBeLessThan(4.24 + 2.44);
      }
    }
  });

  it("lays tiles out on the grid from the strip start", () => {
    const { tiles, tileSeconds, cellW } = filmstripTiles({ ...BASE, pps: 100 });
    expect(cellW).toBe(tileSeconds * 100);
    tiles.forEach((tile, i) => expect(tile.x).toBeCloseTo(i * cellW));
  });

  it("returns no tiles before the timeline has a width or a duration", () => {
    expect(filmstripTiles({ ...BASE, pps: 0 }).tiles).toEqual([]);
    expect(filmstripTiles({ ...BASE, duration: 0, pps: 100 }).tiles).toEqual([]);
  });
});

describe("thumbnailUrl", () => {
  it("matches the thumbnail route's parameters, with two-decimal times", () => {
    expect(
      thumbnailUrl("my project", "compositions/captions.html", {
        t: 1.0 / 3,
        selector: "#captions",
        selectorIndex: 2,
        revision: 4,
      }),
    ).toBe(
      "/api/projects/my%20project/thumbnail/compositions/captions.html?t=0.33&v=v3&revision=4&selector=%23captions&selectorIndex=2",
    );
    expect(thumbnailUrl("p", "index.html", { t: 2, w: 1620, h: 1080, selectorIndex: 0, selector: ".a" })).toBe(
      "/api/projects/p/thumbnail/index.html?t=2.00&v=v3&w=1620&h=1080&revision=0&selector=.a",
    );
  });
});

describe("composition helpers", () => {
  it("adds the every-composition revision to the composition's own", () => {
    expect(thumbnailRevisionOf({ "*": 2, "compositions/a.html": 3 }, "./compositions/a.html")).toBe(5);
    expect(thumbnailRevisionOf({}, "index.html")).toBe(0);
  });

  it("turns a sub-composition source into a project path", () => {
    expect(compositionPathOf("compositions/captions.html", "p")).toBe("compositions/captions.html");
    expect(compositionPathOf("/api/projects/p/preview/compositions/captions.html", "p")).toBe(
      "compositions/captions.html",
    );
    expect(compositionPathOf("http://localhost:5173/api/projects/p/preview/comp/a%20b.html", "p")).toBe("a b.html");
  });
});
