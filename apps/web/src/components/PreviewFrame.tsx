interface PreviewFrameProps {
  entry: string;
  bumpKey: number;
}

export function PreviewFrame({ entry, bumpKey }: PreviewFrameProps) {
  const src = `/preview/${entry}?v=${bumpKey}`;
  return (
    <iframe
      key={bumpKey}
      title="preview"
      src={src}
      className="h-full w-full border-0 bg-white"
    />
  );
}
