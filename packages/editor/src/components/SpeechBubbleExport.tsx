import { useEffect, useRef, useState } from "react";
import { apiPath, useEditorConfig } from "../config.js";
import { useExportProject } from "../hooks/useExportProject.js";
import { useOverlayFontsLoaded } from "../hooks/useOverlayFonts.js";
import { drawOverlay } from "./speechBubbleDraw.js";

export interface SpeechBubbleExportProps {
  projectId: string;
}

/**
 * Headless render target for `#/export/:id`: the entry image at its natural
 * pixel size (no object-contain scaling) with the bubble/caption overlay
 * drawn on top — no editor chrome, no handles, no selection.
 *
 * A screenshot tool navigates here and waits for
 * `document.body.dataset.exportReady === "1"`, which this component sets
 * only after: webfonts are loaded (`document.fonts.ready`), the entry image
 * has decoded, and the overlay has been drawn — in that order, so the
 * captured frame never shows a fallback font or a half-drawn overlay.
 */
export function SpeechBubbleExport({ projectId }: SpeechBubbleExportProps) {
  const config = useEditorConfig();
  const { loading, error, entry, bubbles } = useExportProject(projectId);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dims, setDims] = useState<{ W: number; H: number } | null>(null);
  const fontsReady = useOverlayFontsLoaded();

  const imgUrl = entry
    ? apiPath(config, `/projects/${projectId}/file?path=${encodeURIComponent(entry)}`)
    : null;

  // Load the entry image and wait for it to fully decode before we know the
  // natural pixel size the stage (and the overlay's viewBox) must match.
  useEffect(() => {
    if (!imgUrl) return;
    let cancelled = false;
    setDims(null);
    const im = new Image();
    im.src = imgUrl;
    const onReady = () => {
      if (cancelled) return;
      setDims({ W: im.naturalWidth || 0, H: im.naturalHeight || 0 });
    };
    if (typeof im.decode === "function") {
      im.decode()
        .then(onReady)
        .catch(() => {
          im.onload = onReady;
        });
    } else {
      im.onload = onReady;
    }
    return () => {
      cancelled = true;
    };
  }, [imgUrl]);

  // Draw the overlay once both fonts and image dims are ready (text metrics
  // used for wrapping depend on the real font being loaded), then flag the
  // page ready for capture.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !dims || !fontsReady) return;
    drawOverlay(svg, bubbles, dims);
    document.body.dataset.exportReady = "1";
  }, [bubbles, dims, fontsReady]);

  if (loading || error || !imgUrl || !dims) return null;

  return (
    <div style={{ position: "relative", width: dims.W, height: dims.H, margin: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgUrl}
        alt=""
        width={dims.W}
        height={dims.H}
        style={{ display: "block", width: dims.W, height: dims.H }}
      />
      <svg
        ref={svgRef}
        width={dims.W}
        height={dims.H}
        viewBox={`0 0 ${dims.W} ${dims.H}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      />
    </div>
  );
}
