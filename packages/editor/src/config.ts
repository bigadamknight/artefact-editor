import { createContext, useContext } from "react";

export interface EditorConfig {
  /** Base URL for the JSON API. Default `/api`. */
  apiUrl: string;
  /** Base URL for static preview content (entry HTML, rendered images, MP4s). Default `/preview`. */
  previewUrl: string;
}

export const EditorConfigContext = createContext<EditorConfig>({
  apiUrl: "/api",
  previewUrl: "/preview",
});

export function useEditorConfig(): EditorConfig {
  return useContext(EditorConfigContext);
}

export function apiPath(config: EditorConfig, path: string): string {
  return `${config.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function previewPath(config: EditorConfig, path: string): string {
  return `${config.previewUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
