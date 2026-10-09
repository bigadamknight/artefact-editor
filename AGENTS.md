# artefact-editor — agent guide

This is artefact-editor: a direct-manipulation editor for AI-generated
artefacts (HTML web apps, hyperframes videos, PIL marketing graphics). It
reads `manifest.json` next to whatever the upstream agent emitted, then lets
the user edit text, images, colours, positions, and timing without
round-tripping back to the agent.

If you are an upstream agent producing artefacts that should be editable
here, follow [skills/artefact-emission/SKILL.md](skills/artefact-emission/SKILL.md).
The contract is small: tag every visible piece of content with
`data-edit-id`, emit a `manifest.json` listing each as a block, done.

## If you're working *on* artefact-editor itself

- Use yarn, not npm.
- `yarn dev` runs the CLI on port 7411, the web app (Vite) on 5173 and the
  timeline app (Vite) on 5174, with the bundled examples. Open 5173; it
  proxies `/api` and `/preview` to 7411 and `/timeline` to 5174.
- `yarn typecheck` runs the workspace-wide tsc check; it must pass before
  committing.
- The web app lives in `apps/web` (Vite + React + TS + shadcn/ui). The CLI
  lives in `apps/cli` (Hono server + bin). The timeline app for
  `artefact: "hyperframes"` projects lives in `apps/timeline` (Vite + React
  19, its own document, framed by the editor at `/timeline/#/p/:id`).
- `apps/timeline` is on React 19; the rest of the repo is on React 18. Its
  dependencies are `nohoist` in the root `package.json`, and `apps/web`
  dedupes React, so the two never mix. Keep it that way.
- `apps/timeline` mounts only the brand-free parts of `@hyperframes/studio`
  (Player, Timeline, TimelineEditProvider and the editing hooks). Never
  import StudioApp, EditorShell, StudioHeader, HyperframesLogo,
  HyperframesLoader, PlayerControls or ExternalFileConflictBanner, and keep
  its telemetry flags in `index.html` and `vite.config.ts`. See
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Adapters in `packages/adapter-*`
  must stay format-agnostic — only the adapter for that format knows the
  source layout.
- Edit existing files; don't scaffold a parallel project.

## What this repo edits today

| Adapter                  | Artefact kind                                                        | Source mutation                                                                                |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `adapter-html`           | HTML/CSS web apps, hyperframes videos, Editframe compositions, etc. | parse5 surgical mutations + JS-bundle string mirroring for built apps + GSAP transport bridge  |
| `adapter-hyperframes`    | HyperFrames compositions (`artefact: "hyperframes"`)                 | blocks via `adapter-html`; the timeline app writes clip timing through the studio-server file API (etag-guarded PUT, undo history) |
| `adapter-image-template` | PIL marketing graphics                                               | reads/writes `spec.json`, re-runs Python on save, emits a region sidecar for click-to-select   |

The `adapter-html` path covers any HTML composition that uses stable
selectors — it doesn't care which framework emitted the page. Editframe,
HyperFrames, plain CSS, built React/Vite apps all work through the same
adapter.

## Render and export

- **Image-template** projects render via the Python template.
- **Hyperframes** projects open with the timeline app: preview, transport
  and a multi-track timeline. Dragging, trimming and splitting clips writes
  `index.html` / `compositions/*.html` directly; Cmd+Z / Shift+Cmd+Z undo
  and redo. The block sidebar reloads after each timeline write.
- **Review frames.** Every clip shows a filmstrip of real frames, and a
  composition strip is pinned under the lanes (it is what shows
  script-animated projects with no timed clips). The transport has Onion
  skin and Contact sheet buttons. Agents get the same images from
  `GET /api/projects/:id/{scenes,frame,onion,strip}` (see README "Review").
  GSAP-driven scenes are named by passive `data-scene` / `data-scene-start`
  markers on the scene container; see `spec/emission-spec-v1.md` "Scenes (hyperframes)".
  All of it comes from one capture primitive,
  `packages/adapter-hyperframes/src/frameCapture.ts`: a resident headless
  Chrome that seeks the HyperFrames runtime and screenshots. Chrome is found
  in this order (`chromeExecutable.ts`): `HYPERFRAMES_BROWSER_PATH` /
  `PUPPETEER_EXECUTABLE_PATH`, `~/.cache/hyperframes/chrome`,
  `~/.cache/puppeteer`, system Chrome. With none, review routes answer 503
  with an install hint and video-clip thumbnails still work through ffmpeg.
  Nothing auto-installs a browser. Plan: `spec/video-review-pack.md`.
- **Hyperframes** projects render to MP4 via
  `npx hyperframes render --quality draft`.
- **Any project** can be exported as a `.artefact` zip via the download
  button — manifest + source + assets, build artefacts excluded. Drop it
  into another machine's artefact-editor and pick up where you left off.

## Examples (auto-discovered when run from the repo root)

| Folder                          | Kind            | What it shows                                                       |
| ------------------------------- | --------------- | ------------------------------------------------------------------- |
| `examples/og-card-sample`       | image-template  | OG card driven by `spec.json`, click-to-select via PIL bbox sidecar |
| `examples/bp-ai-chat-video`     | hyperframes     | 40-block social video; transport, multi-track timeline, audio sync  |
| `examples/3d-tunnel-flythrough` | hyperframes     | CSS 3D scene reproducing a gojiberry-style fly-through              |
| `examples/hero-landing`         | html-app        | Tiny landing page with text, image, and brand-colour blocks         |
| `examples/sky-uc14ai`           | html-app        | Larger built React/Vite app with 13 blocks across pillars and CTAs  |
| `examples/editframe-sample`     | html-app        | Editframe-style composition (`<ef-timegroup>` / `<ef-text>`)        |

## Don't

- Don't run `yarn build` and copy artifacts to the server. There's nothing
  deployed remotely; local dev is the workflow.
- Don't add format-specific knowledge to `apps/web` — keep adapters
  responsible for source-of-truth concerns.
- Don't bypass the typecheck. If `yarn typecheck` fails, fix it before
  considering a change done.
