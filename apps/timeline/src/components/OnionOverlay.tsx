import { useRef } from "react";
import { X } from "lucide-react";
import { IconButton, NumberField, usePreviewCompositionRect } from "@hyperframes/studio";
import { ONION_COUNT_MAX, ONION_COUNT_MIN } from "../hooks/useReviewTools";

export interface OnionOverlayProps {
  src: string;
  iframe: HTMLIFrameElement | null;
  n: number;
  onSetCount: (n: number) => void;
  onClose: () => void;
}

/**
 * A blended stack of frames laid exactly over the composition in the preview.
 * The image ignores the pointer, so the preview stays interactive under it.
 */
export function OnionOverlay({ src, iframe, n, onSetCount, onClose }: OnionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const rect = usePreviewCompositionRect(overlayRef, iframe);
  return (
    <div ref={overlayRef} className="ae-onion">
      {rect.width > 0 ? (
        <img
          className="ae-onion__image"
          src={src}
          alt=""
          draggable={false}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ) : null}
      <div className="ae-onion__controls" role="group" aria-label="Onion skin">
        <span className="ae-onion__title">Onion</span>
        <NumberField
          label="Onion frames"
          value={n}
          min={ONION_COUNT_MIN}
          max={ONION_COUNT_MAX}
          step={1}
          onCommit={onSetCount}
        />
        <IconButton size="sm" aria-label="Close onion skin" title="Close" icon={<X size={14} />} onClick={onClose} />
      </div>
    </div>
  );
}
