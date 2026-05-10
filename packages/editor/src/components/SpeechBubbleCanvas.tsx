import { useEffect, useMemo, useRef, useState } from "react";
import rough from "roughjs";
import type { SpeechBubble } from "@artefact-editor/core";
import { apiPath, useEditorConfig } from "../config.js";

const INK = "#3a2418";
const PAPER = "#fdf6e8";
const ROUGHNESS = 1.4;
const BOWING = 2.0;

export interface SpeechBubbleCanvasProps {
  projectId: string;
  entry: string;
  bubbles: SpeechBubble[];
  selectedId: string | null;
  bumpKey: number;
  onSelect: (id: string | null) => void;
  onBubbleChange: (id: string, patch: Partial<SpeechBubble>) => void;
}

interface DragState {
  bubbleId: string;
  which: "anchor" | "tail";
}

/**
 * Image background + SVG overlay. Bubble outlines drawn with rough.js for a
 * hand-drawn feel; tails are part of the same closed path so there's no seam.
 * Drag handles (blue = move, orange = tail tip) initiate drags; the global
 * pointer listeners on the stage / window persist across re-renders so a drag
 * survives the full re-render that each handle move triggers.
 */
export function SpeechBubbleCanvas({
  projectId,
  entry,
  bubbles,
  selectedId,
  bumpKey,
  onSelect,
  onBubbleChange,
}: SpeechBubbleCanvasProps) {
  const config = useEditorConfig();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dims, setDims] = useState({ W: 2528, H: 1696 });
  const [imgLoaded, setImgLoaded] = useState(false);

  const imgUrl = useMemo(
    () => apiPath(config, `/projects/${projectId}/file?path=${encodeURIComponent(entry)}&v=${bumpKey}`),
    [config, projectId, entry, bumpKey],
  );

  useEffect(() => {
    setImgLoaded(false);
    const im = new Image();
    im.src = imgUrl;
    im.onload = () => {
      setDims({ W: im.naturalWidth || 2528, H: im.naturalHeight || 1696 });
      setImgLoaded(true);
    };
  }, [imgUrl]);

  // Drag tracking lives in a ref so re-renders don't reset it mid-drag.
  const dragRef = useRef<DragState | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const loc = pt.matrixTransform(ctm.inverse());
      const next = {
        x: clamp(loc.x / dims.W, 0, 1),
        y: clamp(loc.y / dims.H, 0, 1),
      };
      onBubbleChange(drag.bubbleId, { [drag.which]: next } as Partial<SpeechBubble>);
    }
    function onUp() {
      dragRef.current = null;
    }
    stage.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dims.W, dims.H, onBubbleChange]);

  // Render the SVG content imperatively whenever bubbles / selection / dims
  // change. We keep this out of React's diff because rough.js generates large
  // DOM subtrees we'd rather rebuild wholesale than reconcile.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg as unknown as SVGSVGElement, {
      options: { roughness: ROUGHNESS, bowing: BOWING, seed: 1 },
    });
    for (const b of bubbles) drawBubble(svg, rc, b, dims, onSelect);
    for (const b of bubbles) {
      drawHandles(svg, b, dims, b.id === selectedId, (which) => {
        dragRef.current = { bubbleId: b.id, which };
        onSelect(b.id);
      });
    }
  }, [bubbles, dims.W, dims.H, selectedId, onSelect]);

  return (
    <div ref={stageRef} className="relative h-full w-full select-none bg-muted">
      {/* Patrick Hand for hand-drawn bubble text (matches the SYITM register) */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap" />
      <div className="relative mx-auto h-full" style={{ aspectRatio: `${dims.W} / ${dims.H}` }}>
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt=""
            className="block h-full w-full object-contain"
            style={{ pointerEvents: "none" }}
          />
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${dims.W} ${dims.H}`}
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {!imgLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading image…
          </div>
        ) : null}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const SVG_NS = "http://www.w3.org/2000/svg";

function drawBubble(
  svg: SVGSVGElement,
  rc: ReturnType<typeof rough.svg>,
  b: SpeechBubble,
  dims: { W: number; H: number },
  onSelect: (id: string | null) => void,
) {
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
  const blockH = Math.max(lines.length, 1) * lineH;

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
    ts.setAttribute("y", String(startY + i * lineH));
    ts.textContent = ln;
    text.appendChild(ts);
  });
  // Bring text above outline by re-appending.
  svg.appendChild(text);
}

function drawHandles(
  svg: SVGSVGElement,
  b: SpeechBubble,
  dims: { W: number; H: number },
  selected: boolean,
  startDrag: (which: "anchor" | "tail") => void,
) {
  const { W, H } = dims;
  const fs = (b.fontSize || 0.024) * H;
  const r = Math.max(fs * 0.7, 14);

  const ax = b.anchor.x * W;
  const ay = b.anchor.y * H;
  const tx = b.tail.x * W;
  const ty = b.tail.y * H;

  function makeHandle(cx: number, cy: number, color: string, which: "anchor" | "tail") {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", String(which === "tail" ? r * 0.7 : r));
    c.setAttribute("fill", color);
    c.setAttribute("stroke", selected ? "yellow" : "white");
    c.setAttribute("stroke-width", "2");
    c.setAttribute("opacity", "0.85");
    c.style.cursor = "move";
    c.style.pointerEvents = "all";
    c.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      startDrag(which);
    });
    svg.appendChild(c);
  }

  makeHandle(ax, ay, "#2563eb", "anchor");
  makeHandle(tx, ty, "#f59e0b", "tail");
}

function wrap(textEl: SVGTextElement, str: string, maxWidth: number): string[] {
  const words = String(str).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  const probe = document.createElementNS(SVG_NS, "tspan");
  textEl.appendChild(probe);
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    probe.textContent = trial;
    if (probe.getComputedTextLength() > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  textEl.removeChild(probe);
  return lines;
}
