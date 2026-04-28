import { forwardRef, useEffect, useRef, useState } from "react";

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
}

const DEFAULT_W = 1080;
const DEFAULT_H = 1080;

export const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(
  function PreviewFrame({ entry, bumpKey, fit = "scaled", stale = false }, ref) {
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
        <div ref={wrapperRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-100 p-6">
          <img
            key={bumpKey}
            src={src}
            alt="Rendered preview"
            className={[
              "max-h-full max-w-full rounded-md object-contain shadow-lg transition-opacity",
              stale ? "opacity-50" : "",
            ].join(" ")}
          />
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
