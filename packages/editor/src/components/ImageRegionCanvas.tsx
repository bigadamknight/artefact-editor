import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { apiPath, useEditorConfig } from "../config.js";

export interface ImageRegionCanvasProps {
  projectId: string;
  entry: string;
  /** Increments after each apply so the entry image refetches. */
  bumpKey?: number;
  /** Fires when the painted mask becomes empty/non-empty so parents can enable Apply. */
  onMaskChange?: (hasMask: boolean) => void;
}

export interface ImageRegionCanvasHandle {
  /** Returns the mask as a base64 PNG (no data: prefix). White = repaint, black = preserve. */
  getMaskBase64(): Promise<string | null>;
  /** Returns whether the user has painted anything yet. */
  hasMask(): boolean;
  clearMask(): void;
}

type Tool = "brush" | "eraser";

interface Stroke {
  tool: Tool;
  size: number;
  points: Array<{ x: number; y: number }>;
}

const MASK_OVERLAY_COLOR = "rgba(255, 0, 0, 0.45)";

export const ImageRegionCanvas = forwardRef<ImageRegionCanvasHandle, ImageRegionCanvasProps>(
  function ImageRegionCanvas({ projectId, entry, bumpKey = 0, onMaskChange }, ref) {
    const config = useEditorConfig();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    // displayCanvas: visible mask overlay (red translucent, scaled to display size)
    const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    // dataCanvas: black/white mask at natural source resolution, never displayed
    const dataCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [tool, setTool] = useState<Tool>("brush");
    const [brushSize, setBrushSize] = useState(60);
    const [painting, setPainting] = useState(false);
    const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null);
    const [hasPaint, setHasPaint] = useState(false);
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);

    const imgUrl =
      apiPath(config, `/projects/${projectId}/file?path=${encodeURIComponent(entry)}`) +
      `&v=${bumpKey}`;

    /** Set up the data canvas at natural res whenever the entry image loads. */
    const handleImageLoad = useCallback(() => {
      const img = imgRef.current;
      if (!img) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNaturalDims({ w, h });
      // Reset both canvases to fresh black.
      const data = dataCanvasRef.current;
      if (data) {
        data.width = w;
        data.height = h;
        const ctx = data.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, w, h);
        }
      }
      strokesRef.current = [];
      setHasPaint(false);
      // Display canvas size matches the rendered image, set in resize effect.
      requestAnimationFrame(syncDisplaySize);
    }, []);

    /** Resize the display canvas to match the rendered image's CSS box. */
    const syncDisplaySize = useCallback(() => {
      const img = imgRef.current;
      const display = displayCanvasRef.current;
      if (!img || !display) return;
      const rect = img.getBoundingClientRect();
      // Use devicePixelRatio so brush strokes look crisp on retina.
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(rect.width);
      const cssH = Math.round(rect.height);
      if (cssW === 0 || cssH === 0) return;
      display.style.width = `${cssW}px`;
      display.style.height = `${cssH}px`;
      display.width = Math.round(cssW * dpr);
      display.height = Math.round(cssH * dpr);
      // Position display canvas exactly over the image.
      display.style.left = `${img.offsetLeft}px`;
      display.style.top = `${img.offsetTop}px`;
      redrawDisplay();
    }, []);

    /** Re-render the display overlay from the strokes list (after resize/undo/clear). */
    const redrawDisplay = useCallback(() => {
      const display = displayCanvasRef.current;
      if (!display || !naturalDims) return;
      const ctx = display.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, display.width, display.height);
      const scaleX = display.width / naturalDims.w;
      const scaleY = display.height / naturalDims.h;
      ctx.fillStyle = MASK_OVERLAY_COLOR;
      ctx.globalCompositeOperation = "source-over";
      for (const stroke of strokesRef.current) {
        if (stroke.tool === "eraser") continue;
        for (const p of stroke.points) {
          ctx.beginPath();
          ctx.arc(p.x * scaleX, p.y * scaleY, (stroke.size * scaleX) / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Eraser strokes "punch holes" in the mask — repaint everything additively
      // then carve eraser circles out using destination-out.
      ctx.globalCompositeOperation = "destination-out";
      for (const stroke of strokesRef.current) {
        if (stroke.tool !== "eraser") continue;
        for (const p of stroke.points) {
          ctx.beginPath();
          ctx.arc(p.x * scaleX, p.y * scaleY, (stroke.size * scaleX) / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }, [naturalDims]);

    /** Re-stamp every stroke into the data canvas (used after undo/clear). */
    const repaintDataCanvas = useCallback(() => {
      const data = dataCanvasRef.current;
      if (!data || !naturalDims) return;
      const ctx = data.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, data.width, data.height);
      for (const stroke of strokesRef.current) {
        ctx.fillStyle = stroke.tool === "brush" ? "#fff" : "#000";
        for (const p of stroke.points) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }, [naturalDims]);

    /** Map a pointer event to natural-image coordinates. */
    const eventToNatural = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const display = displayCanvasRef.current;
        if (!display || !naturalDims) return null;
        const rect = display.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * naturalDims.w;
        const y = ((e.clientY - rect.top) / rect.height) * naturalDims.h;
        return { x, y };
      },
      [naturalDims],
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = eventToNatural(e);
        if (!p) return;
        const stroke: Stroke = { tool, size: brushSize, points: [p] };
        currentStrokeRef.current = stroke;
        strokesRef.current = [...strokesRef.current, stroke];
        setPainting(true);
        // Stamp first dot to both canvases.
        stampPoint(p, stroke);
        if (tool === "brush") setHasPaint(true);
      },
      [tool, brushSize, eventToNatural],
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!painting || !currentStrokeRef.current) return;
        const p = eventToNatural(e);
        if (!p) return;
        currentStrokeRef.current.points.push(p);
        stampPoint(p, currentStrokeRef.current);
      },
      [painting, eventToNatural],
    );

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      currentStrokeRef.current = null;
      setPainting(false);
    }, []);

    /** Incrementally stamp a single point on both data + display canvases. */
    function stampPoint(p: { x: number; y: number }, stroke: Stroke) {
      const data = dataCanvasRef.current;
      const display = displayCanvasRef.current;
      if (!data || !display || !naturalDims) return;
      const dctx = data.getContext("2d");
      if (dctx) {
        dctx.fillStyle = stroke.tool === "brush" ? "#fff" : "#000";
        dctx.beginPath();
        dctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
        dctx.fill();
      }
      const xctx = display.getContext("2d");
      if (xctx) {
        const scaleX = display.width / naturalDims.w;
        const scaleY = display.height / naturalDims.h;
        if (stroke.tool === "brush") {
          xctx.globalCompositeOperation = "source-over";
          xctx.fillStyle = MASK_OVERLAY_COLOR;
        } else {
          xctx.globalCompositeOperation = "destination-out";
          xctx.fillStyle = "rgba(0,0,0,1)";
        }
        xctx.beginPath();
        xctx.arc(p.x * scaleX, p.y * scaleY, (stroke.size * scaleX) / 2, 0, Math.PI * 2);
        xctx.fill();
        xctx.globalCompositeOperation = "source-over";
      }
    }

    const undoStroke = useCallback(() => {
      strokesRef.current = strokesRef.current.slice(0, -1);
      setHasPaint(strokesRef.current.some((s) => s.tool === "brush"));
      repaintDataCanvas();
      redrawDisplay();
    }, [repaintDataCanvas, redrawDisplay]);

    const clearMask = useCallback(() => {
      strokesRef.current = [];
      setHasPaint(false);
      repaintDataCanvas();
      redrawDisplay();
    }, [repaintDataCanvas, redrawDisplay]);

    useEffect(() => {
      onMaskChange?.(hasPaint);
    }, [hasPaint, onMaskChange]);

    /** Resize observer: re-sync display canvas whenever the rendered image moves. */
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const ro = new ResizeObserver(() => syncDisplaySize());
      ro.observe(container);
      window.addEventListener("resize", syncDisplaySize);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", syncDisplaySize);
      };
    }, [syncDisplaySize]);

    useImperativeHandle(
      ref,
      () => ({
        async getMaskBase64() {
          const data = dataCanvasRef.current;
          if (!data || !hasPaint) return null;
          const blob: Blob | null = await new Promise((res) => data.toBlob(res, "image/png"));
          if (!blob) return null;
          const buf = await blob.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
          return btoa(binary);
        },
        hasMask: () => hasPaint,
        clearMask,
      }),
      [clearMask, hasPaint],
    );

    return (
      <div className="flex h-full w-full flex-col bg-muted">
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2 text-sm">
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setTool("brush")}
              className={`rounded px-3 py-1 text-xs ${
                tool === "brush" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Brush
            </button>
            <button
              type="button"
              onClick={() => setTool("eraser")}
              className={`rounded px-3 py-1 text-xs ${
                tool === "eraser" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Eraser
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Size
            <input
              type="range"
              min={4}
              max={200}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-32"
            />
            <span className="w-10 tabular-nums text-foreground">{brushSize}px</span>
          </label>
          <button
            type="button"
            onClick={undoStroke}
            disabled={strokesRef.current.length === 0}
            className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40"
          >
            Undo stroke
          </button>
          <button
            type="button"
            onClick={clearMask}
            disabled={strokesRef.current.length === 0}
            className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40"
          >
            Clear mask
          </button>
          <div className="ml-auto text-xs text-muted-foreground">
            {hasPaint ? "Mask has paint" : "Paint white where you want the model to redraw"}
          </div>
        </div>
        <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {/* The image fills the container, contain-fit, centred. */}
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={imgUrl}
              alt="Source"
              className="block max-h-[calc(100vh-200px)] max-w-full select-none"
              draggable={false}
              onLoad={handleImageLoad}
            />
            <canvas
              ref={displayCanvasRef}
              className="absolute left-0 top-0 cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            {/* Hidden full-resolution mask canvas. */}
            <canvas ref={dataCanvasRef} className="hidden" />
          </div>
        </div>
      </div>
    );
  },
);
