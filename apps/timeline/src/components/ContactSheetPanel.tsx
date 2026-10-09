import { Copy, ExternalLink, X } from "lucide-react";
import { Button, IconButton, NumberField } from "@hyperframes/studio";
import {
  STRIP_COLUMNS_MAX,
  STRIP_COLUMNS_MIN,
  STRIP_COUNT_MAX,
  STRIP_COUNT_MIN,
} from "../hooks/useReviewTools";

export interface ContactSheetPanelProps {
  src: string;
  n: number;
  columns: number;
  rangeLabel: string;
  onSetCount: (n: number) => void;
  onSetColumns: (columns: number) => void;
  onOpenImage: () => void;
  onCopyUrl: () => void;
  onClose: () => void;
}

/** A labelled grid of frames across the review range. */
export function ContactSheetPanel({
  src,
  n,
  columns,
  rangeLabel,
  onSetCount,
  onSetColumns,
  onOpenImage,
  onCopyUrl,
  onClose,
}: ContactSheetPanelProps) {
  return (
    <aside className="ae-panel" aria-label="Contact sheet">
      <header className="ae-panel__header">
        <span className="ae-panel__title">Contact sheet</span>
        <span className="ae-panel__subtitle">{rangeLabel}</span>
        <IconButton size="sm" aria-label="Close contact sheet" title="Close" icon={<X size={14} />} onClick={onClose} />
      </header>
      <div className="ae-panel__fields">
        <div className="ae-panel__field">
          <span aria-hidden="true">Frames</span>
          <NumberField
            label="Contact sheet frames"
            value={n}
            min={STRIP_COUNT_MIN}
            max={STRIP_COUNT_MAX}
            step={1}
            onCommit={onSetCount}
          />
        </div>
        <div className="ae-panel__field">
          <span aria-hidden="true">Columns</span>
          <NumberField
            label="Contact sheet columns"
            value={columns}
            min={STRIP_COLUMNS_MIN}
            max={STRIP_COLUMNS_MAX}
            step={1}
            onCommit={onSetColumns}
          />
        </div>
      </div>
      <div className="ae-panel__body">
        <img className="ae-panel__image" src={src} alt={`Contact sheet, ${rangeLabel}`} />
      </div>
      <footer className="ae-panel__actions">
        <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />} onClick={onOpenImage}>
          Open image
        </Button>
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={onCopyUrl}>
          Copy URL
        </Button>
      </footer>
    </aside>
  );
}
