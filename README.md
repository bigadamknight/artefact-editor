# artefact-editor

Direct-manipulation editor for AI-generated artefacts.

AI agents emit artefacts — landing pages, social videos, OG cards, marketing
graphics. Tweaking copy or colour usually means re-prompting the agent and
hoping it doesn't clobber the rest. **artefact-editor** sits on top of
whatever the agent wrote and lets you edit text, images, colours, positions,
and timing directly. The source files stay byte-identical except for the
fields you actually changed.

Think of it as Storybook for AI artefacts.

## What it edits today

| Adapter | What it edits | How |
|---|---|---|
| `adapter-html` | HTML/CSS web apps, landing pages, hyperframes videos | parse5 surgical mutations + inline-style upserts |
| `adapter-image-template` | PIL marketing graphics (OG cards, LinkedIn posts, etc) | reads `spec.json`, writes back, re-renders via Python |

Each adapter consumes a `manifest.json` next to the artefact that lists
**blocks** (text, image, colour, audio, timing) and how each block maps back
to the source. See `spec/emission-spec-v1.md` and
`spec/agent-prompt-fragment.md` for the contract agents follow.

## Quickstart

```bash
yarn install
yarn dev               # starts the CLI server + Vite with HMR
                       # → http://localhost:5173
```

Or build once and run as a single process:

```bash
yarn build
yarn workspace @artefact-editor/cli start ./examples/og-card-sample
                       # → http://localhost:7411
```

After `yarn link`-ing or `npm install -g`, the same command becomes:

```bash
artefact-editor ./examples/og-card-sample
```

## Examples

- `examples/og-card-sample/` — PIL OG card driven by a `spec.json`. Click any
  text region to edit it, then hit Render to regenerate the PNG.
- `examples/bp-ai-chat-video/` — hyperframes video with 40+ editable text,
  audio, and timing blocks. Transport bar drives a GSAP timeline.
- `examples/3d-tunnel-flythrough/` — calendar-tunnel scene built on the same
  hyperframes machinery, demonstrating CSS 3D transforms.

## Layout

```
apps/
  cli/             # Hono server + bin. CLI: artefact-editor <project-dir>
  web/             # Vite + React + TS + shadcn/ui + Tailwind
packages/
  core/            # Format-agnostic. Block, descriptors, Doc, commands.
  adapter-html/    # HTML adapter. parse5-based mutations, preview bridge.
  adapter-image-template/  # PIL spec.json adapter, shells to python3 to render.
spec/
  emission-spec-v1.md         # Contract agents follow when emitting artefacts.
  agent-prompt-fragment.md    # Drop-in instructions for the emitting agent.
examples/
  og-card-sample/
  bp-ai-chat-video/
  3d-tunnel-flythrough/
```

## How edits work

Edits become **commands** (`setProperty`, `addBlock`, …) which the adapter
applies to the on-disk source. parse5's source-offset tracking lets the HTML
adapter rewrite a single attribute or text node without reformatting the
file. The image-template adapter writes back to `spec.json`, then the editor
re-runs the PIL template to regenerate the PNG.

For PIL templates that opt in (call `self.track(key, x, y, w, h)` during
`_draw_content`), `BaseTemplate.save()` emits a `<output>.layout.json`
sidecar. The editor uses it to overlay click-to-select hit zones on the
rendered image — the same direct-selection feel iframe artefacts get from the
preview bridge.

## License

MIT — see [LICENSE](LICENSE).
