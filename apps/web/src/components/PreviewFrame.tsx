import { forwardRef } from "react";

interface PreviewFrameProps {
  entry: string;
  bumpKey: number;
}

export const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(
  function PreviewFrame({ entry, bumpKey }, ref) {
    const src = `/preview/${entry}?v=${bumpKey}`;
    return (
      <iframe
        ref={ref}
        key={bumpKey}
        title="preview"
        src={src}
        className="h-full w-full border-0 bg-white"
      />
    );
  },
);
