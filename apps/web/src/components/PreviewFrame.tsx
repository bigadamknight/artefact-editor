import { forwardRef, useEffect, useRef, useState } from "react";

interface ImageRegion {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageLayout {
  width: number;
  height: number;
  regions: ImageRegion[];
}

interface PreviewFrameProps {
  entry: string;
  bumpKey: number;
  /**
   * "scaled" — fit a fixed-size composition (eg. 1080×1080 video frame) into
   * the container with uniform CSS scale. Default for video artefacts.
   *
   * "fill" — render the iframe at the container's full size, no scaling. Right
   * for responsive web apps where the page handles its own layout.
   *
   * "image" — render an <img> instead of an iframe. The entry is a static
   * raster (typically a PNG produced by a render step).
   */
  fit?: "scaled" | "fill" | "image";
  /** image mode only: signal that the rendered file is older than the spec. */
  stale?: boolean;
  /**
   * image mode only: spec-key → block-id map, derived from the manifest. Used
   * to translate region keys (`title`, `subtitle`, …) emitted by the PIL
   * template into editor block IDs.
   */
  specKeyToBlockId?: Record<string, string>;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
}

const DEFAULT_W = 1080;
const DEFAULT_H = 1080;

interface ImageModePreviewProps {
  src: string;
  bumpKey: number;
  entry: string;
  stale: boolean;
  specKeyToBlockId: Record<string, string>;
  selectedBlockId: string | null;
  onSelectBlock?: (blockId: string) => void;
}

function ImageModePreview({
  src, bumpKey, entry, stale, specKeyToBlockId, selectedBlockId, onSelectBlock,
}: ImageModePreviewProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [layout, setLayout] = useState<ImageLayout | null>(null);
  const [imgRect, setImgRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Fetch layout.json (sidecar emitted by the PIL render). Re-fetch whenever
  // bumpKey changes — every save/render bumps it.
  useEffect(() => {
    let cancelled = false;
    fetch(`/preview/${entry}.layout.json?v=${bumpKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLayout(data && Array.isArray(data.regions) ? (data as ImageLayout) : null);
      })
      .catch(() => {
        if (!cancelled) setLayout(null);
      });
    return () => { cancelled = true; };
  }, [entry, bumpKey]);

  // Track the <img>'s rendered rect inside its parent so we can place hit
  // zones on top. object-fit: contain leaves letterboxing we have to account
  // for, so we measure both the natural and rendered sizes.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    function measure() {
      if (!img || !img.parentElement) return;
      const parent = img.parentElement.getBoundingClientRect();
      const rect = img.getBoundingClientRect();
      setImgRect({ x: rect.left - parent.left, y: rect.top - parent.top, w: rect.width, h: rect.height });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    if (img.parentElement) ro.observe(img.parentElement);
    img.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      img.removeEventListener("load", measure);
    };
  }, [bumpKey]);

  const scale = layout && imgRect ? imgRect.w / layout.width : 0;
  const hasRegions = layout && imgRect && scale > 0;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-100 p-6">
      <img
        ref={imgRef}
        key={bumpKey}
        src={src}
        alt="Rendered preview"
        className={[
          "max-h-full max-w-full rounded-md object-contain shadow-lg transition-opacity",
          stale ? "opacity-50" : "",
        ].join(" ")}
      />
      {hasRegions ? (
        <div
          className="absolute"
          style={{ left: imgRect!.x, top: imgRect!.y, width: imgRect!.w, height: imgRect!.h }}
        >
          {layout!.regions.map((r) => {
            const blockId = specKeyToBlockId[r.key];
            if (!blockId) return null;
            const isSelected = blockId === selectedBlockId;
            const isHover = r.key === hoverKey;
            return (
              <button
                type="button"
                key={r.key}
                onClick={() => onSelectBlock?.(blockId)}
                onMouseEnter={() => setHoverKey(r.key)}
                onMouseLeave={() => setHoverKey((k) => (k === r.key ? null : k))}
                className="absolute cursor-pointer bg-transparent p-0"
                style={{
                  left: r.x * scale,
                  top: r.y * scale,
                  width: r.w * scale,
                  height: r.h * scale,
                  outline: isSelected
                    ? "2px solid rgb(34, 211, 238)"
                    : isHover
                    ? "2px dashed rgba(34, 211, 238, 0.7)"
                    : "none",
                  outlineOffset: 2,
                }}
                aria-label={`Select ${r.key}`}
              />
            );
          })}
        </div>
      ) : null}
      {stale ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm">
            Preview is out of date — click <span className="font-bold">Render</span> to update.
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(
  function PreviewFrame(
    { entry, bumpKey, fit = "scaled", stale = false, specKeyToBlockId, selectedBlockId, onSelectBlock },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [natural, setNatural] = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H });
    const [container, setContainer] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0]!.contentRect;
        setContainer({ w: r.width, h: r.height });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      function onMsg(e: MessageEvent) {
        const d = e.data;
        if (!d || d.type !== "ae:ready") return;
        if (typeof d.width === "number" && typeof d.height === "number" && d.width > 0 && d.height > 0) {
          setNatural({ w: d.width, h: d.height });
        }
      }
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
    }, []);

    const scale = container.w > 0 && container.h > 0
      ? Math.min(container.w / natural.w, container.h / natural.h)
      : 1;
    const scaledW = natural.w * scale;
    const scaledH = natural.h * scale;

    const src = `/preview/${entry}?v=${bumpKey}`;

    if (fit === "image") {
      return (
        <ImageModePreview
          src={src}
          bumpKey={bumpKey}
          entry={entry}
          stale={stale}
          specKeyToBlockId={specKeyToBlockId ?? {}}
          selectedBlockId={selectedBlockId ?? null}
          onSelectBlock={onSelectBlock}
        />
      );
    }

    if (fit === "fill") {
      return (
        <div ref={wrapperRef} className="relative h-full w-full overflow-hidden bg-white">
          <iframe
            ref={ref}
            key={bumpKey}
            title="preview"
            src={src}
            className="h-full w-full border-0 bg-white"
          />
        </div>
      );
    }

    return (
      <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
        <div
          className="absolute"
          style={{
            left: (container.w - scaledW) / 2,
            top: (container.h - scaledH) / 2,
            width: scaledW,
            height: scaledH,
          }}
        >
          <iframe
            ref={ref}
            key={bumpKey}
            title="preview"
            src={src}
            className="border-0 bg-white"
            style={{
              width: natural.w,
              height: natural.h,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    );
  },
);
