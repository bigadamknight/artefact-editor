import { useEffect, useState } from "react";
import type { GetProjectResponse } from "@artefact-editor/contract";
import type { SpeechBubble } from "@artefact-editor/core";
import { apiPath, useEditorConfig } from "../config.js";

export interface ExportProjectState {
  loading: boolean;
  error: string | null;
  entry: string;
  bubbles: SpeechBubble[];
}

/**
 * Minimal read-only project fetch for the headless export route: just the
 * entry image path and the bubble overlay. No pending-edit tracking, no
 * save/render — that's `useDoc`'s job for the interactive editor.
 */
export function useExportProject(projectId: string): ExportProjectState {
  const config = useEditorConfig();
  const [state, setState] = useState<ExportProjectState>({
    loading: true,
    error: null,
    entry: "",
    bubbles: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    void (async () => {
      try {
        const res = await fetch(apiPath(config, `/projects/${projectId}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GetProjectResponse;
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          entry: data.entry,
          bubbles: data.bubbles ?? [],
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          entry: "",
          bubbles: [],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, config]);

  return state;
}
