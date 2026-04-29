import { useEffect, useState } from "react";
import { Film, ImageIcon, Layout } from "lucide-react";

interface ProjectSummary {
  id: string;
  name: string;
  artefact: "html-app" | "hyperframes" | "image-template";
  entry: string;
}

interface HomePageProps {
  onOpen: (id: string) => void;
}

const ARTEFACT_LABEL: Record<ProjectSummary["artefact"], string> = {
  "html-app": "Web app",
  "hyperframes": "Video",
  "image-template": "Image template",
};

function ArtefactIcon({ kind }: { kind: ProjectSummary["artefact"] }) {
  const cls = "h-4 w-4";
  if (kind === "hyperframes") return <Film className={cls} />;
  if (kind === "image-template") return <ImageIcon className={cls} />;
  return <Layout className={cls} />;
}

function PreviewThumb({ project }: { project: ProjectSummary }) {
  // Image-template projects have a real PNG entry we can show directly.
  if (project.artefact === "image-template") {
    return (
      <img
        src={`/preview/${project.id}/${project.entry}`}
        alt={project.name}
        className="h-full w-full object-contain bg-neutral-100"
      />
    );
  }
  // For HTML-based artefacts (web apps, hyperframes videos), embed the iframe
  // muted at a tiny scale so the card shows the live thing, not a placeholder.
  // pointer-events-none keeps it click-through to the card button.
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <iframe
        src={`/preview/${project.id}/${project.entry}`}
        title={project.name}
        className="pointer-events-none border-0"
        style={{
          width: 1080,
          height: 1080,
          transform: "scale(0.18)",
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

export default function HomePage({ onOpen }: HomePageProps) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setProjects(data.projects ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold">artefact-editor</h1>
          <p className="mt-2 text-muted-foreground">
            Direct-manipulation editor for AI-generated artefacts. Pick a sample
            below to play with — edits persist to disk, just as they would for
            real agent output.
          </p>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Failed to load projects: {error}
          </div>
        ) : null}

        {projects === null && !error ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : null}

        {projects && projects.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No projects loaded. Pass one or more project directories to the CLI:
            <pre className="mt-2 inline-block rounded bg-muted px-2 py-1 text-xs">
              artefact-editor ./my-project
            </pre>
          </div>
        ) : null}

        {projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p.id)}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-primary hover:shadow-md"
              >
                <div className="aspect-video w-full overflow-hidden border-b border-border">
                  <PreviewThumb project={p} />
                </div>
                <div className="flex flex-col gap-1 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ArtefactIcon kind={p.artefact} />
                    <span>{ARTEFACT_LABEL[p.artefact]}</span>
                  </div>
                  <div className="text-base font-medium group-hover:text-primary">
                    {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.id}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
