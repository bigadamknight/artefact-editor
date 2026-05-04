# @artefact-editor/editor

Embeddable React component for editing AI-generated artefacts inside another app. Pairs with [`@artefact-editor/contract`](../contract) — your backend implements that contract against your own storage; the editor talks to it.

## Install

The package is a workspace package today (not yet published to npm). From a sibling app in the same monorepo:

```json
{
  "dependencies": {
    "@artefact-editor/editor": "0.1.0",
    "@artefact-editor/contract": "0.1.0"
  }
}
```

Peer deps: `react ^18.3` and `react-dom ^18.3`.

## Mount

```tsx
import { ArtefactEditor } from "@artefact-editor/editor";

export function EditPage({ id }: { id: string }) {
  return (
    <ArtefactEditor
      projectId={id}
      apiUrl="/artefacts/api"
      previewUrl="/artefacts/preview"
      onBack={() => history.back()}
    />
  );
}
```

| Prop          | Default     | Notes                                                                      |
| ------------- | ----------- | -------------------------------------------------------------------------- |
| `projectId`   | required    | Identifier the backend resolves to a project.                              |
| `apiUrl`      | `/api`      | Base URL for the JSON API. Can be relative or absolute.                    |
| `previewUrl`  | `/preview`  | Base URL for static preview content (entry HTML, rendered images, MP4s).   |
| `onBack`      | `undefined` | When provided, the top bar shows a back button that calls this.            |

The editor reads `apiUrl` / `previewUrl` from a React context internally, so all hooks (load, save, render, asset list, image-template layout sidecar) hit the right backend without any further wiring.

## Tailwind preset

The editor uses utility classes (`bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`, …) that need to resolve to real CSS values in the host app. Import the preset:

```ts
// tailwind.config.ts in the host app
import editorPreset from "@artefact-editor/editor/tailwind-preset";

export default {
  presets: [editorPreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@artefact-editor/editor/dist/**/*.js",
  ],
};
```

The `content` glob pointing at the editor's compiled JS is required — without it Tailwind tree-shakes away the editor's classes. Override colours by extending after the preset.

## Implement the backend contract

The editor expects these endpoints under `apiUrl` / `previewUrl`. Schemas are exported from `@artefact-editor/contract`.

| Method | Path                                              | Request body            | Response                  |
| ------ | ------------------------------------------------- | ----------------------- | ------------------------- |
| GET    | `{apiUrl}/projects`                               | —                       | `ListProjectsResponse`    |
| GET    | `{apiUrl}/projects/:id`                           | —                       | `GetProjectResponse`      |
| POST   | `{apiUrl}/projects/:id/save`                      | `SaveRequest`           | `SaveResponse`            |
| POST   | `{apiUrl}/projects/:id/render`                    | —                       | `RenderResponse`          |
| GET    | `{apiUrl}/projects/:id/assets`                    | —                       | `ListAssetsResponse`      |
| GET    | `{apiUrl}/projects/:id/archive`                   | —                       | `application/zip` stream  |
| GET    | `{apiUrl}/projects/:id/comments`                  | —                       | `ListCommentsResponse`    |
| POST   | `{apiUrl}/projects/:id/comments`                  | `CreateCommentRequest`  | `CreateCommentResponse`   |
| DELETE | `{apiUrl}/projects/:id/comments/:commentId`       | —                       | `DeleteCommentResponse`   |
| POST   | `{apiUrl}/projects/:id/comments/apply`            | —                       | `ApplyCommentsResponse`   |
| GET    | `{previewUrl}/:id/<path>`                         | —                       | static file (entry, rendered output, assets, layout sidecar) |

A minimal Hono handler validating saves against the contract:

```ts
import { Hono } from "hono";
import { saveRequestSchema } from "@artefact-editor/contract";

const app = new Hono();

app.post("/api/projects/:id/save", async (c) => {
  const parse = saveRequestSchema.safeParse(await c.req.json());
  if (!parse.success) return c.json({ ok: false, error: parse.error.message }, 400);

  const { commands } = parse.data;
  // …apply commands against your storage (R2, Postgres, filesystem, …)
  return c.json({ ok: true, changed: commands.length });
});
```

The reference implementation lives in [`apps/cli/src/index.ts`](../../apps/cli/src/index.ts) — it backs the contract with the local filesystem and the bundled adapters (`@artefact-editor/adapter-html`, `@artefact-editor/adapter-image-template`). Reuse those adapters if your storage exposes a `ProjectFiles`-shaped interface; implement the contract directly otherwise.

## Comment-and-apply loop

The editor has a comment mode (toggle via the **Comment** button in the top bar or the `c` key) that lets users leave plain-English notes on individual blocks instead of editing them directly. Comments queue up in a side panel; clicking **Apply** calls `POST /comments/apply`, which returns a generated prompt describing the edits the agent should make.

For now `apply` is a **dry run** — it returns the prompt but does not invoke an agent. The intended host integration is to forward the prompt (plus the listed source files) to the Claude Agent SDK or equivalent and surface the agent's edits back to the user. Comment status (`pending` → `applied` / `dismissed`) is in the schema for that future flow.

## What's not in this package

- **No bundled backend.** Mount your own. A `mountArtefactEditor(app, opts)` Hono mounter is a candidate follow-up so hosts can drop the reference handlers in unchanged when their storage is filesystem-shaped.
- **No project picker.** That's a host concern — your app already knows which project the user is opening. The bundled `apps/web` has a `HomePage` you can crib from.
- **No auth.** Whatever auth the host already enforces on `apiUrl` / `previewUrl` covers the editor too.
