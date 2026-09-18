import type { BlockId } from "./block.js";
import type { PropertyValue } from "./descriptor.js";

export type Command =
  | {
      type: "setProperty";
      blockId: BlockId;
      key: string;
      value: PropertyValue;
    }
  | {
      /**
       * Apply a masked-region edit to an image-region block.
       * `maskPng` is a base64-encoded grayscale PNG: white = repaint, black = preserve.
       * `refImagePaths` are project-relative paths to additional images (e.g.
       * canon character refs) the model should consult while filling the region.
       */
      type: "applyImageRegion";
      blockId: BlockId;
      prompt: string;
      maskPng: string;
      refImagePaths?: string[];
    }
  | {
      /** Promote a saved version to the entry file (replacing canon). */
      type: "promoteImageVersion";
      blockId: BlockId;
      versionId: string;
    }
  | {
      /**
       * Replace the entire bubble array on a speech-bubbles block. We don't
       * incrementally diff individual bubble fields — the array is small and
       * the editor mutates it freely (drag, edit, add, delete).
       */
      type: "setSpeechBubbles";
      blockId: BlockId;
      bubbles: SpeechBubble[];
    };

export interface SpeechBubble {
  id: string;
  character?: string;
  text: string;
  anchor: { x: number; y: number };
  tail: { x: number; y: number };
  /**
   * "say" = solid outline, "whisper" = dashed. "narration" = borderless
   * left-aligned caption block. "title" = borderless centred title text.
   */
  style: "say" | "whisper" | "narration" | "title";
  /** narration/title only: "light" = cream text with a dark halo, for dark art. Defaults to "dark". */
  tone?: "dark" | "light";
  /** Bubble width as fraction of image width (0..1). */
  width: number;
  /** Font size as fraction of image height (0..1). */
  fontSize: number;
  /** -1..+1: tail curl direction. 0 = symmetric isoceles triangle. Defaults to 0.7 if omitted. */
  tailSweep?: number;
}
