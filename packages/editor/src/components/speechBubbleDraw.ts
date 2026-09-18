import rough from "roughjs";
import type { SpeechBubble } from "@artefact-editor/core";

export const INK = "#3a2418";
export const PAPER = "#fdf6e8";
const ROUGHNESS = 1.4;
const BOWING = 2.0;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Clears `svg` and draws every bubble/caption in `bubbles` onto it. Shared by
 * the interactive editor canvas (which draws its own drag handles on top
 * afterwards) and the headless export route (no handles, no selection).
 */
export function drawOverlay(
  svg: SVGSVGElement,
  bubbles: SpeechBubble[],
  dims: { W: number; H: number },
  onSelect?: (id: string | null) => void,
): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const rc = rough.svg(svg as unknown as SVGSVGElement, {
    options: { roughness: ROUGHNESS, bowing: BOWING, seed: 1 },
  });
  const select = onSelect ?? (() => {});
  for (const b of bubbles) drawBubble(svg, rc, b, dims, select);
}

export function drawBubble(
  svg: SVGSVGElement,
  rc: ReturnType<typeof rough.svg>,
  b: SpeechBubble,
  dims: { W: number; H: number },
  onSelect: (id: string | null) => void,
): void {
  if (b.style === "narration" || b.style === "title") {
    drawCaption(svg, b, dims, onSelect);
    return;
  }

  const { W, H } = dims;
  const ax = b.anchor.x * W;
  const ay = b.anchor.y * H;
  const tx = b.tail.x * W;
  const ty = b.tail.y * H;
  const bw = (b.width || 0.2) * W;
  const fs = (b.fontSize || 0.024) * H;
  const padX = fs * 1.1;
  const padY = fs * 0.7;

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("font-size", String(fs));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", '"Patrick Hand", "Caveat", "Comic Sans MS", cursive');
  text.setAttribute("fill", "#2a1810");
  text.style.pointerEvents = "none";
  svg.appendChild(text);
  const lines = wrap(text, b.text || "", bw - 2 * padX);
  const lineH = fs * 1.15;
  const offsets = lineOffsets(lines);
  const blockH = ((offsets[offsets.length - 1] ?? 0) + 1) * lineH;

  const rx = bw / 2 + padX * 0.2;
  const ry = blockH / 2 + padY + fs * 0.15;

  const dx = tx - ax;
  const dy = ty - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const dirAngle = Math.atan2(uy, ux);
  const halfAngle = b.style === "whisper" ? 0.13 : 0.16;
  const a1 = dirAngle - halfAngle;
  const a2 = dirAngle + halfAngle;
  const p1x = ax + rx * Math.cos(a1);
  const p1y = ay + ry * Math.sin(a1);
  const p2x = ax + rx * Math.cos(a2);
  const p2y = ay + ry * Math.sin(a2);
  const sweep = typeof b.tailSweep === "number" ? b.tailSweep : 0.7;
  const off = fs * 0.6 * sweep;
  const c1x = (p1x + tx) / 2 + -uy * off;
  const c1y = (p1y + ty) / 2 + ux * off;
  const c2x = (p2x + tx) / 2 + -uy * off;
  const c2y = (p2y + ty) / 2 + ux * off;

  const closedPath =
    `M ${p1x} ${p1y} ` +
    `A ${rx} ${ry} 0 1 0 ${p2x} ${p2y} ` +
    `Q ${c2x} ${c2y} ${tx} ${ty} ` +
    `Q ${c1x} ${c1y} ${p1x} ${p1y} Z`;

  const fill = document.createElementNS(SVG_NS, "path");
  fill.setAttribute("d", closedPath);
  fill.setAttribute("fill", PAPER);
  fill.setAttribute("stroke", "none");
  fill.style.pointerEvents = "all";
  fill.style.cursor = "pointer";
  fill.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    onSelect(b.id);
  });
  svg.appendChild(fill);

  const dashed = b.style === "whisper";
  const strokeOpts: Record<string, unknown> = {
    stroke: INK,
    strokeWidth: fs * 0.1,
    fill: "none",
    strokeLineDash: dashed ? [fs * 0.5, fs * 0.35] : undefined,
  };
  const outline = rc.path(closedPath, strokeOpts);
  outline.style.pointerEvents = "none";
  svg.appendChild(outline);

  const startY = ay - blockH / 2 + fs * 0.85;
  while (text.firstChild) text.removeChild(text.firstChild);
  lines.forEach((ln, i) => {
    const ts = document.createElementNS(SVG_NS, "tspan");
    ts.setAttribute("x", String(ax));
    ts.setAttribute("y", String(startY + offsets[i]! * lineH));
    ts.textContent = ln.text;
    text.appendChild(ts);
  });
  // Bring text above outline by re-appending.
  svg.appendChild(text);
}

/**
 * narration / title: borderless caption text with a paper-coloured legibility
 * halo (stroke drawn under the fill via paint-order) instead of a bubble
 * shape. narration is left-aligned and vertically centred on the anchor;
 * title is centred on the anchor, same as bubble text.
 */
function drawCaption(
  svg: SVGSVGElement,
  b: SpeechBubble,
  dims: { W: number; H: number },
  onSelect: (id: string | null) => void,
): void {
  const { W, H } = dims;
  const isTitle = b.style === "title";
  const ax = b.anchor.x * W;
  const ay = b.anchor.y * H;
  const bw = (b.width || 0.2) * W;
  const fs = (b.fontSize || 0.024) * H;

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("font-size", String(fs));
  text.setAttribute("text-anchor", isTitle ? "middle" : "start");
  text.setAttribute(
    "font-family",
    isTitle ? '"Patrick Hand", "Caveat", "Comic Sans MS", cursive' : '"Andika", "Segoe UI", sans-serif',
  );
  const light = b.tone === "light";
  text.setAttribute("fill", light ? PAPER : INK);
  text.setAttribute("paint-order", "stroke");
  text.setAttribute("stroke", light ? INK : PAPER);
  text.setAttribute("stroke-width", String(fs * (light ? 0.28 : 0.35)));
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("stroke-opacity", light ? "0.55" : "0.85");
  text.style.pointerEvents = "all";
  text.style.cursor = "pointer";
  text.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    onSelect(b.id);
  });
  svg.appendChild(text);

  const maxWidth = bw;
  const lines = wrap(text, b.text || "", maxWidth);
  const lineH = fs * 1.35;
  // Titles break lines on "\n" without the paragraph gap narration uses.
  const offsets = isTitle ? lines.map((_, i) => i) : lineOffsets(lines);
  const blockH = ((offsets[offsets.length - 1] ?? 0) + 1) * lineH;

  const startY = ay - blockH / 2 + fs * 0.85;
  const x = isTitle ? ax : ax - bw / 2;

  while (text.firstChild) text.removeChild(text.firstChild);
  lines.forEach((ln, i) => {
    const ts = document.createElementNS(SVG_NS, "tspan");
    ts.setAttribute("x", String(x));
    ts.setAttribute("y", String(startY + offsets[i]! * lineH));
    ts.textContent = ln.text;
    text.appendChild(ts);
  });
}

interface WrappedLine {
  text: string;
  /** True when this is the first wrapped line of a paragraph after the first. */
  paragraphStart: boolean;
}

/**
 * Splits on "\n" first (each segment is a paragraph), then word-wraps each
 * paragraph to `maxWidth` using the live SVG text metrics of `textEl`. The
 * first line of every paragraph after the first is flagged so the caller can
 * add extra vertical space (a visual paragraph gap) before it.
 */
export function wrap(textEl: SVGTextElement, str: string, maxWidth: number): WrappedLine[] {
  const paragraphs = String(str).split("\n");
  const out: WrappedLine[] = [];
  const probe = document.createElementNS(SVG_NS, "tspan");
  textEl.appendChild(probe);
  paragraphs.forEach((para, pi) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push({ text: "", paragraphStart: pi > 0 });
      return;
    }
    let cur = "";
    let firstInParagraph = true;
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      probe.textContent = trial;
      if (probe.getComputedTextLength() > maxWidth && cur) {
        out.push({ text: cur, paragraphStart: pi > 0 && firstInParagraph });
        firstInParagraph = false;
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) out.push({ text: cur, paragraphStart: pi > 0 && firstInParagraph });
  });
  textEl.removeChild(probe);
  return out.length ? out : [{ text: "", paragraphStart: false }];
}

/** Cumulative vertical offset (in line-height units) for each wrapped line. */
function lineOffsets(lines: WrappedLine[]): number[] {
  const offsets: number[] = [];
  let cur = 0;
  lines.forEach((l, i) => {
    if (i > 0) cur += l.paragraphStart ? 1.6 : 1;
    offsets.push(cur);
  });
  return offsets;
}
