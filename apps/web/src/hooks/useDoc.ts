import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, Command } from "@artefact-editor/core";

interface ProjectResponse {
  name: string;
  root: string;
  entry: string;
  blocks: Block[];
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
  pendingValues: Map<string, Record<string, string | number>>;
  isDirty: boolean;
  saving: boolean;
  bumpKey: number; // increments after save → use as iframe key to force reload
}

export interface UseDocApi {
  state: DocState;
  setProperty: (blockId: string, key: string, value: string | number) => void;
  save: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useDoc(): UseDocApi {
  const [state, setState] = useState<DocState>({
    loading: true,
    error: null,
    name: "",
    entry: "index.html",
    blocks: [],
    pendingValues: new Map(),
    isDirty: false,
    saving: false,
    bumpKey: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchProject = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/project");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ProjectResponse;
      setState((s) => ({
        ...s,
        loading: false,
        name: data.name,
        entry: data.entry,
        blocks: data.blocks,
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
  }, []);

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

    try {
      const res = await fetch("/api/save", {
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
    setState((s) => ({ ...s, saving: false }));
  }, [fetchProject]);

  return { state, setProperty, save, reload: fetchProject };
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
