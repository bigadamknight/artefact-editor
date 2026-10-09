import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  composeContactSheet,
  composeOnion,
  contactSheetWidth,
  onionAlphas,
  onionWeights,
  SHEET_GUTTER,
} from "./reviewImages";

function solid(r: number, g: number, b: number, width = 64, height = 36): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return Array.from(data.subarray(at, at + 3));
}

describe("onion weights", () => {
  it("ramp from 0.14 to 1, and a single frame weighs 1", () => {
    const weights = onionWeights(3);
    expect(weights[0]).toBeCloseTo(0.14);
    expect(weights[1]).toBeCloseTo(0.57);
    expect(weights[2]).toBeCloseTo(1);
    expect(onionWeights(1)).toEqual([1]);
    expect(onionAlphas(1)).toEqual([1]);
  });
});

describe("composeOnion", () => {
  it("blends three solid frames into their weighted mean", async () => {
    const frames = [await solid(255, 0, 0), await solid(0, 255, 0), await solid(0, 0, 255)];
    const out = await composeOnion(frames, { width: 64, height: 36, label: "" });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect([meta.width, meta.height]).toEqual([64, 36]);
    // Weights 0.14, 0.57, 1 (sum 1.71); the label sits bottom-left, away from the centre.
    const [r, g, b] = await pixel(out, 32, 10);
    expect(r).toBeGreaterThanOrEqual(19);
    expect(r).toBeLessThanOrEqual(23);
    expect(g).toBeGreaterThanOrEqual(83);
    expect(g).toBeLessThanOrEqual(87);
    expect(b).toBeGreaterThanOrEqual(147);
    expect(b).toBeLessThanOrEqual(151);
  });

  it("shows a single frame at full strength", async () => {
    const out = await composeOnion([await solid(200, 100, 50)], { width: 64, height: 36, label: "x" });
    expect(await pixel(out, 32, 10)).toEqual([200, 100, 50]);
  });
});

describe("composeContactSheet", () => {
  it("is columns × cell width plus a gutter around every cell", async () => {
    const frame = await solid(10, 20, 30, 160, 90);
    const cells = Array.from({ length: 6 }, (_, i) => ({ frame: i === 4 ? null : frame, label: `t=${i}.00s` }));
    const out = await composeContactSheet(cells, { columns: 4, cellWidth: 120, aspect: 16 / 9, title: "sheet" });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(4 * 120 + 5 * SHEET_GUTTER);
    expect(meta.width).toBe(contactSheetWidth(4, 120));
    // A frame cell keeps the frame's colour in its middle.
    expect(await pixel(out, SHEET_GUTTER + 60, 40 + SHEET_GUTTER + 30)).toEqual([10, 20, 30]);
  });
});
