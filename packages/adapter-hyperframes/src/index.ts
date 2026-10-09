import type { Adapter, Block, Command, ProjectFiles } from "@artefact-editor/core";
import { htmlAdapter } from "@artefact-editor/adapter-html";

/**
 * HyperFrames adapter.
 *
 * HyperFrames compositions are plain HTML documents (`data-*` timing
 * attributes, `class="clip"`, tracks) so, exactly like editframe, load/apply
 * for the block sidebar (text/color/timing blocks declared in the project's
 * `manifest.json`) delegate to the adapter-html implementation — parse5
 * doesn't care which framework owns the document.
 *
 * What's genuinely different for hyperframes is the timeline itself: instead
 * of the block sidebar driving playback, the project is opened in an
 * embedded HyperFrames Studio timeline (see `studioApi.ts`), which reads and
 * writes the same `index.html` / `compositions/*.html` files directly via
 * `@hyperframes/studio-server`.
 */
export const hyperframesAdapter: Adapter = {
  id: "hyperframes",
  async load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }> {
    return htmlAdapter.load(files);
  },
  async apply(files: ProjectFiles, blocks: Block[], commands: Command[]): Promise<void> {
    return htmlAdapter.apply(files, blocks, commands);
  },
};

export { createHyperframesStudioApi } from "./studioApi.js";
export type { HyperframesProjectRef } from "./studioApi.js";
export { closeFrameCapture, ChromeUnavailableError } from "./frameCapture.js";
export { listScenes } from "./scenes.js";
export type { Scene, SceneList } from "./scenes.js";
