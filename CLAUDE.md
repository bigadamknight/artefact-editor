# artefact-editor

Read [AGENTS.md](AGENTS.md) first: workspaces, commands and rules.

## Workspaces and dev ports

| Workspace | What | Port |
|-----------|------|------|
| `apps/cli` | Hono API + static server (`/api`, `/preview`, built `/timeline/`) | 7411 |
| `apps/web` | Editor shell; proxies `/api`, `/preview` to 7411 and `/timeline` to 5174 | 5173 |
| `apps/timeline` | Timeline app for `artefact: "hyperframes"` projects (React 19, framed at `/timeline/#/p/:id`) | 5174 |
| `packages/adapter-hyperframes` | Blocks via adapter-html + studio-server file/preview/history API under `/api`; frame capture (headless Chrome) for thumbnails and the review routes | — |

The editor and the timeline frame talk by `postMessage`:
`ae:timeline-changed` (timeline wrote a file, editor reloads blocks) and
`ae:refresh-preview` (editor saved, timeline reloads its preview).

`apps/timeline/src/components/TimelineEditor.tsx` composes Studio's timeline
parts by hand (Provider → Frame → composition strip → RazorGuide → Overlays)
instead of using `<Timeline>`, so the composition strip can sit inside the
lanes' scroll area. Clip filmstrips come from `useTimelineEditor`'s
`renderClipContent`; media clips still use Studio's renderers.
