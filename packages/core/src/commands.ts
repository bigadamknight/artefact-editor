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
    };
