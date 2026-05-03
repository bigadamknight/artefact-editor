import { useEffect, useState } from "react";
import type { ListProjectsResponse, ProjectSummary } from "@artefact-editor/contract";

export type { ProjectSummary };

interface UseProjectsResult {
  projects: ProjectSummary[] | null;
  error: string | null;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ListProjectsResponse) => {
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { projects, error };
}
