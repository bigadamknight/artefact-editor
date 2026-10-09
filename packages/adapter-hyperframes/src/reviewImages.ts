import sharp from "sharp";

/**
 * Review images composed from captured frames with sharp: an onion skin
 * (frames blended, later ones stronger) and a labelled contact sheet.
 * Pure image work; capture happens in frameCapture.ts.
 */

const LABEL_FONT = "Helvetica, Arial, sans-serif";

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Weight of each onion frame, oldest first: 0.14 → 1 (a single frame weighs 1). */
export function onionWeights(n: number): number[] {
  if (n <= 1) return [1];
  return Array.from({ length: n }, (_, i) => 0.14 + (0.86 * i) / (n - 1));
}

/**
 * Per-layer alpha for compositing the frames `over` each other so the result
 * is the weighted mean of the frames. Opaque frames composited at the raw
 * weights would let the last (weight 1) frame hide all the others; layer i at
 * `w[i] / (w[0] + … + w[i])` leaves every frame visible in proportion to its weight.
 */
export function onionAlphas(n: number): number[] {
  const weights = onionWeights(n);
  let total = 0;
  return weights.map((w) => {
    total += w;
    return w / total;
  });
}

function labelSvg(width: number, height: number, label: string): Buffer {
  const fontSize = Math.max(11, Math.round(height / 32));
  const pad = Math.round(fontSize * 0.6);
  const boxH = fontSize + pad * 2;
  const boxW = Math.min(width - pad * 2, Math.round(label.length * fontSize * 0.58) + pad * 2);
  const y = height - boxH - pad;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${pad}" y="${y}" width="${boxW}" height="${boxH}" rx="${Math.round(pad / 2)}" fill="rgba(0,0,0,0.65)"/>` +
      `<text x="${pad * 2}" y="${y + pad + fontSize * 0.85}" font-family="${LABEL_FONT}" font-size="${fontSize}" fill="#fff">${escapeXml(label)}</text>` +
      `</svg>`,
  );
}

/** Blend `frames` (time order) on black into one PNG, with `label` bottom-left. */
export async function composeOnion(
  frames: Buffer[],
  opts: { width: number; height: number; label: string },
): Promise<Buffer> {
  const { width, height } = opts;
  const alphas = onionAlphas(frames.length);
  const layers = await Promise.all(
    frames.map((frame, i) =>
      sharp(frame)
        .resize(width, height, { fit: "fill" })
        .removeAlpha()
        .ensureAlpha(alphas[i] ?? 1)
        .png()
        .toBuffer(),
    ),
  );
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([
      ...layers.map((input) => ({ input, blend: "over" as const })),
      { input: labelSvg(width, height, opts.label), blend: "over" as const },
    ])
    .png()
    .toBuffer();
}

export const SHEET_GUTTER = 8;
const CAPTION_HEIGHT = 24;
const TITLE_HEIGHT = 40;
const SHEET_BACKGROUND = { r: 17, g: 17, b: 17, alpha: 1 };

/** Width of a contact sheet: the cells plus a gutter on both sides of each. */
export function contactSheetWidth(columns: number, cellWidth: number): number {
  return columns * cellWidth + (columns + 1) * SHEET_GUTTER;
}

/**
 * Lay `cells` out in a grid of `columns`, each frame resized to `cellWidth`
 * wide at `aspect` (width / height) with its label in a caption band under
 * it, below a title row. A null frame leaves a grey cell.
 */
export async function composeContactSheet(
  cells: { frame: Buffer | null; label: string }[],
  opts: { columns: number; cellWidth: number; aspect: number; title: string },
): Promise<Buffer> {
  const columns = Math.max(1, Math.min(opts.columns, cells.length || 1));
  const cellW = opts.cellWidth;
  const imageH = Math.max(1, Math.round(cellW / opts.aspect));
  const rows = Math.max(1, Math.ceil(cells.length / columns));
  const width = contactSheetWidth(columns, cellW);
  const height = TITLE_HEIGHT + rows * (imageH + CAPTION_HEIGHT) + (rows + 1) * SHEET_GUTTER;

  const svg: string[] = [
    `<text x="${SHEET_GUTTER}" y="${Math.round(TITLE_HEIGHT * 0.7) + SHEET_GUTTER / 2}" font-family="${LABEL_FONT}" font-size="18" font-weight="600" fill="#eee">${escapeXml(opts.title)}</text>`,
  ];
  const layers: sharp.OverlayOptions[] = [];
  for (const [i, cell] of cells.entries()) {
    const left = SHEET_GUTTER + (i % columns) * (cellW + SHEET_GUTTER);
    const top = TITLE_HEIGHT + SHEET_GUTTER + Math.floor(i / columns) * (imageH + CAPTION_HEIGHT + SHEET_GUTTER);
    if (cell.frame) {
      const input = await sharp(cell.frame).resize(cellW, imageH, { fit: "fill" }).png().toBuffer();
      layers.push({ input, left, top });
    } else {
      svg.push(`<rect x="${left}" y="${top}" width="${cellW}" height="${imageH}" fill="#333"/>`);
    }
    svg.push(
      `<rect x="${left}" y="${top + imageH}" width="${cellW}" height="${CAPTION_HEIGHT}" fill="#000"/>`,
      `<text x="${left + 8}" y="${top + imageH + 17}" font-family="${LABEL_FONT}" font-size="14" fill="#fff">${escapeXml(cell.label)}</text>`,
    );
  }
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svg.join("")}</svg>`);
  return sharp({ create: { width, height, channels: 4, background: SHEET_BACKGROUND } })
    .composite([...layers, { input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
}
