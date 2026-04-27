import type { Block } from "./block.js";
import type { Command } from "./commands.js";

export interface ProjectFiles {
  read(file: string): Promise<string>;
  readBinary(file: string): Promise<Uint8Array>;
  write(file: string, contents: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  exists(file: string): Promise<boolean>;
}

export interface Adapter {
  id: string;
  load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }>;
  /**
   * Apply commands to the project, mutating source files in place.
   * Implementations MUST be surgical — only the bytes corresponding to changed
   * properties may differ.
   */
  apply(files: ProjectFiles, blocks: Block[], commands: Command[]): Promise<void>;
}
