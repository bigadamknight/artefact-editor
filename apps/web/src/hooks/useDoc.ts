import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, Command } from "@artefact-editor/core";

type ArtefactKind = "html-app" | "hyperframes" | "image-template";

interface ProjectResponse {
  name: string;
  root: string;
  entry: string;
  blocks: Block[];
  artefact?: ArtefactKind;
  previewStale?: boolean;
}

interface SaveResponse {
  ok: boolean;
  changed?: number;
  error?: string;
}

export interface DocState {
  loading: boolean;
  error: string | null;
  name: string;
  entry: string;
  blocks: Block[];
  artefact: ArtefactKind;
  pendingValues: Map<string, Record<string, string | number>>;
  isDirty: boolean;
  saving: boolean;
  rendering: boolean;
  /**
   * For image-template artefacts: spec was saved more recently than the entry
   * was rendered. The preview <img> is showing stale output.
   */
  previewStale: boolean;
  bumpKey: number; // increments after save → use as iframe key to force reload
}

export interface UseDocApi {
  state: DocState;
  setProperty: (blockId: string, key: string, value: string | number) => void;
  save: () => Promise<void>;
  render: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useDoc(projectId: string): UseDocApi {
  const [state, setState] = useState<DocState>({
    loading: true,
    error: null,
    name: "",
    entry: "index.html",
    blocks: [],
    artefact: "html-app",
    pendingValues: new Map(),
    isDirty: false,
    saving: false,
    rendering: false,
    previewStale: false,
    bumpKey: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchProject = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ProjectResponse;
      setState((s) => ({
        ...s,
        loading: false,
        name: data.name,
        entry: data.entry,
        blocks: data.blocks,
        artefact: data.artefact ?? "html-app",
        previewStale: data.previewStale ?? false,
        pendingValues: new Map(),
        isDirty: false,
        bumpKey: s.bumpKey + 1,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [projectId]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  const setProperty = useCallback(
    (blockId: string, key: string, value: string | number) => {
      setState((s) => {
        const block = s.blocks.find((b) => b.id === blockId);
        if (!block) return s;
        const next = new Map(s.pendingValues);
        const existing = { ...(next.get(blockId) ?? {}) };
        if (block.values[key] === value) {
          delete existing[key];
        } else {
          existing[key] = value;
        }
        if (Object.keys(existing).length === 0) {
          next.delete(blockId);
        } else {
          next.set(blockId, existing);
        }
        return { ...s, pendingValues: next, isDirty: next.size > 0 };
      });
    },
    [],
  );

  const save = useCallback(async () => {
    const cur = stateRef.current;
    const commands: Command[] = [];
    for (const [blockId, values] of cur.pendingValues) {
      for (const [key, value] of Object.entries(values)) {
        commands.push({ type: "setProperty", blockId, key, value });
      }
    }
    if (commands.length === 0) return;
    setState((s) => ({ ...s, saving: true }));

    const wasImageTemplate = stateRef.current.artefact === "image-template";
    try {
      const res = await fetch(`/api/projects/${projectId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commands }),
      });
      const data = (await res.json()) as SaveResponse;
      if (!data.ok) throw new Error(data.error ?? "Save failed");
    } catch (err) {
      setState((s) => ({
        ...s,
        saving: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      return;
    }

    await fetchProject();
    // For image-template artefacts the rendered output.png is now stale
    // relative to the just-saved spec. Flag it so the UI can prompt for render.
    setState((s) => ({ ...s, saving: false, previewStale: wasImageTemplate }));
  }, [fetchProject, projectId]);

  const render = useCallback(async () => {
    setState((s) => ({ ...s, rendering: true }));
    try {
      const res = await fetch(`/api/projects/${projectId}/render`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Render failed");
      // Bump bumpKey so the <img> reloads from disk; clear stale flag.
      setState((s) => ({ ...s, rendering: false, previewStale: false, bumpKey: s.bumpKey + 1 }));
    } catch (err) {
      setState((s) => ({
        ...s,
        rendering: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [projectId]);

  return { state, setProperty, save, render, reload: fetchProject };
}

export function getEffectiveValue(
  block: Block,
  pending: Map<string, Record<string, string | number>>,
  key: string,
): string | number {
  const p = pending.get(block.id);
  if (p && key in p) return p[key]!;
  return block.values[key] ?? "";
}
