# artefact-editor

Direct-manipulation editor for AI-generated artefacts.

AI agents emit structured artefacts (HTML web apps, videos, slide decks, reports). This editor lets users tweak text, images, colours, and other typed properties directly — no agent re-prompt loop, no clobbered tweaks on regen.

## How it works

Agents emit two things: a source artefact (e.g. `index.html` + `styles.css`) and a `manifest.json` listing addressable **blocks** with typed property descriptors. The editor reads the manifest, builds an in-memory doc, renders a generic descriptor-driven inspector, and applies edits as **surgical source-file mutations** — your file's formatting and unmarked content stay byte-identical.

See `spec/emission-spec-v1.md` for the contract.

## MVP scope

- **One adapter:** HTML web apps (`adapter-html`).
- **Three block kinds:** text, image, colour token.
- **Explicit save** — no autosave. Atomic writes.
- **No merge protocol yet** — that's v2 once the editing model is proved.

## Quickstart

```bash
yarn install
yarn build:packages
yarn dev
# in another shell, point the server at a project:
yarn workspace @artefact-editor/server start -- examples/hero-landing
```

Then open `http://localhost:5173`.

## Layout

```
apps/
  server/          # Hono + Node. CLI: artefact-editor <project-dir>
  web/             # Vite + React + TS + shadcn/ui + Tailwind
packages/
  core/            # Format-agnostic. Block, descriptors, Doc, commands.
  adapter-html/    # HTML web app adapter. parse5-based mutations.
spec/
  emission-spec-v1.md
examples/
  hero-landing/    # Sample artefact for dogfooding
```
