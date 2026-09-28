import type { Adapter, Block, Command, ProjectFiles } from "@artefact-editor/core";
import { htmlAdapter } from "@artefact-editor/adapter-html";

/**
 * Editframe adapter.
 *
 * Editframe compositions are HTML documents built from custom elements
 * (`<ef-timegroup>`, `<ef-text>`, `<ef-video>`, `<ef-audio>`, `<ef-image>`,
 * `<ef-captions>`, ...). For load and apply, parse5 doesn't care about the
 * tag name — selectors against `[data-edit-id="..."]` and attribute or text
 * mutations work identically to plain HTML. We delegate those to the
 * adapter-html implementation.
 *
 * What is genuinely different is the preview transport: editframe drives
 * playback through the root `<ef-timegroup>` element's `currentTimeMs`,
 * `seek(ms)`, `play()`, `pause()` API rather than `window.__timelines`.
 * That lives in {@link editframePreviewBridgeScript} and is selected by
 * the host server (CLI) based on `manifest.artefact === "editframe"`.
 */
export const editframeAdapter: Adapter = {
  id: "editframe",
  async load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }> {
    return htmlAdapter.load(files);
  },
  async apply(files: ProjectFiles, blocks: Block[], commands: Command[]): Promise<void> {
    return htmlAdapter.apply(files, blocks, commands);
  },
};

export { editframePreviewBridgeScript } from "./bridge.js";
