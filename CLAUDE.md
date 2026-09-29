# artefact-editor

Read [AGENTS.md](AGENTS.md) first: workspaces, commands and rules.

## Workspaces and dev ports

| Workspace | What | Port |
|-----------|------|------|
| `apps/cli` | Hono API + static server (`/api`, `/preview`, built `/timeline/`) | 7411 |
| `apps/web` | Editor shell; proxies `/api`, `/preview` to 7411 and `/timeline` to 5174 | 5173 |
| `apps/timeline` | Timeline app for `artefact: "hyperframes"` projects (React 19, framed at `/timeline/#/p/:id`) | 5174 |
| `packages/adapter-hyperframes` | Blocks via adapter-html + studio-server file/preview/history API under `/api` | — |

The editor and the timeline frame talk by `postMessage`:
`ae:timeline-changed` (timeline wrote a file, editor reloads blocks) and
`ae:refresh-preview` (editor saved, timeline reloads its preview).
