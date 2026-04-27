import type { PropertyDescriptor, PropertyValue } from "./descriptor.js";

export type BlockId = string;

export type BlockKind = "text" | "image" | "color" | "audio" | "timing";

export type SourceRef =
  | { tag: "selector"; file: string; selector: string }
  | { tag: "cssVar"; file: string; cssVar: string }
  | { tag: "astVar"; file: string; varName: string };

export interface Block {
  id: BlockId;
  kind: BlockKind;
  label: string;
  source: SourceRef;
  descriptors: PropertyDescriptor[];
  values: Record<string, PropertyValue>;
}
