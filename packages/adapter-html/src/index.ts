import type { Adapter, Block, Command, ProjectFiles } from "@artefact-editor/core";
import { loadProject } from "./load.js";
import { applyCommands } from "./mutate.js";

export const htmlAdapter: Adapter = {
  id: "html-app",
  async load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }> {
    const { blocks, entryFile } = await loadProject(files);
    return { blocks, entryFile };
  },
  async apply(files: ProjectFiles, blocks: Block[], commands: Command[]): Promise<void> {
    await applyCommands(files, blocks, commands);
  },
};

export { previewBridgeScript } from "./inject.js";
export { loadProject } from "./load.js";
