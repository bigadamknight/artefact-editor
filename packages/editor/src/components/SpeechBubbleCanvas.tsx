import { useEffect, useMemo, useRef, useState } from "react";
import type { SpeechBubble } from "@artefact-editor/core";
import { apiPath, useEditorConfig } from "../config.js";
import { drawOverlay } from "./speechBubbleDraw.js";

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
    drawOverlay(svg, bubbles, dims, onSelect);
    for (const b of bubbles) {
      drawHandles(svg, b, dims, b.id === selectedId, (which) => {
        dragRef.current = { bubbleId: b.id, which };
        onSelect(b.id);
      });
    }
  }, [bubbles, dims.W, dims.H, selectedId, onSelect]);

  return (
    <div ref={stageRef} className="relative h-full w-full select-none bg-muted">
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
  // narration / title are borderless captions with no tail — only the anchor
  // (move) handle applies.
  const hasTail = b.style !== "narration" && b.style !== "title";

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
  if (hasTail) makeHandle(tx, ty, "#f59e0b", "tail");
}
