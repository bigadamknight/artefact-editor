import type { BlockId } from "./block.js";
import type { PropertyValue } from "./descriptor.js";

export type Command = {
  type: "setProperty";
  blockId: BlockId;
  key: string;
  value: PropertyValue;
};
