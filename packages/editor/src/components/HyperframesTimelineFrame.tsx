import type { Ref } from "react";

interface HyperframesTimelineFrameProps {
  src: string;
  frameRef: Ref<HTMLIFrameElement>;
}

/**
 * The timeline app (apps/timeline) in its own document: preview, transport
 * and timeline for an `artefact: "hyperframes"` project. It runs its own
 * React and stylesheet, which is why it is framed rather than mounted here.
 */
export function HyperframesTimelineFrame({ src, frameRef }: HyperframesTimelineFrameProps) {
  return (
    <iframe
      ref={frameRef}
      src={src}
      title="Timeline"
      className="block h-full w-full border-0 bg-black"
      allow="autoplay; fullscreen"
    />
  );
}
