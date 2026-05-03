import { z } from "zod";
import type { Block } from "@artefact-editor/core";

/**
 * Wire schemas for the artefact-editor HTTP API.
 *
 * The editor (frontend) imports the response types to type its `fetch` calls.
 * Host backends import the request schemas to parse incoming requests, and
 * the response types to type their handlers.
 *
 * Request bodies are full Zod schemas — they need runtime validation. Response
 * shapes are TypeScript interfaces — the server constructs them and TS keeps
 * them honest. Block is intentionally typed as the core `Block` interface
 * rather than re-defined as Zod; duplicating that discriminated union is
 * not worth the maintenance cost here.
 */

export const ARTEFACT_KINDS = ["html-app", "hyperframes", "image-template"] as const;
export type ArtefactKind = (typeof ARTEFACT_KINDS)[number];

const propertyValueSchema = z.union([z.string(), z.number()]);

export const setPropertyCommandSchema = z.object({
  type: z.literal("setProperty"),
  blockId: z.string(),
  key: z.string(),
  value: propertyValueSchema,
});

export const commandSchema = z.discriminatedUnion("type", [setPropertyCommandSchema]);

export const saveRequestSchema = z.object({
  commands: z.array(commandSchema),
});
export type SaveRequest = z.infer<typeof saveRequestSchema>;

export interface ProjectSummary {
  id: string;
  name: string;
  artefact: ArtefactKind;
  entry: string;
}

export interface ListProjectsResponse {
  projects: ProjectSummary[];
}

export interface GetProjectResponse {
  id: string;
  name: string;
  root: string;
  entry: string;
  blocks: Block[];
  artefact: ArtefactKind;
  previewStale: boolean;
}

export interface SaveResponse {
  ok: boolean;
  changed?: number;
  error?: string;
}

export interface RenderResponse {
  ok: boolean;
  output?: string;
  previewUrl?: string;
  stdout?: string;
  error?: string;
}

export interface ListAssetsResponse {
  assets: string[];
}

/**
 * Layout JSON served alongside image-template previews. Lists each rendered
 * region (text/image) with its bounds so the editor can overlay click targets.
 */
export interface ImageRegion {
  /** specKey of the block this region maps to (or a synthetic key for unbound text/image areas). */
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageLayout {
  width: number;
  height: number;
  regions: ImageRegion[];
}
