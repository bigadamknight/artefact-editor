import { useEffect, useState } from "react";

export interface ProjectSummary {
  id: string;
  name: string;
  artefact: "html-app" | "hyperframes" | "image-template";
  entry: string;
}

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
      .then((data) => {
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
