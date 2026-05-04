import { useCallback, useEffect, useState } from "react";
import type {
  ApplyCommentsResponse,
  Comment,
  CreateCommentResponse,
  ListCommentsResponse,
} from "@artefact-editor/contract";
import { apiPath, useEditorConfig } from "../config.js";

export interface UseCommentsApi {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  add: (blockId: string, text: string) => Promise<Comment | null>;
  remove: (commentId: string) => Promise<void>;
  apply: () => Promise<ApplyCommentsResponse | null>;
  reload: () => Promise<void>;
}

export function useComments(projectId: string): UseCommentsApi {
  const config = useEditorConfig();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiPath(config, `/projects/${projectId}/comments`));
      const data = (await res.json()) as ListCommentsResponse;
      setComments(data.comments ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, config]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (blockId: string, text: string): Promise<Comment | null> => {
      try {
        const res = await fetch(apiPath(config, `/projects/${projectId}/comments`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blockId, text }),
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return null;
        }
        const data = (await res.json()) as CreateCommentResponse;
        setComments((prev) => [...prev, data.comment]);
        return data.comment;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [projectId, config],
  );

  const remove = useCallback(
    async (commentId: string) => {
      // Optimistic — drop locally first, restore on failure.
      const prev = comments;
      setComments((cs) => cs.filter((c) => c.id !== commentId));
      try {
        const res = await fetch(
          apiPath(config, `/projects/${projectId}/comments/${commentId}`),
          { method: "DELETE" },
        );
        if (!res.ok) {
          setComments(prev);
          setError(`HTTP ${res.status}`);
        }
      } catch (err) {
        setComments(prev);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [comments, projectId, config],
  );

  const apply = useCallback(async (): Promise<ApplyCommentsResponse | null> => {
    try {
      const res = await fetch(apiPath(config, `/projects/${projectId}/comments/apply`), {
        method: "POST",
      });
      const data = (await res.json()) as ApplyCommentsResponse;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [projectId, config]);

  return { comments, loading, error, add, remove, apply, reload };
}
