# artefact-editor

> Direct-manipulation editor for AI-generated artefacts.

AI agents emit artefacts — landing pages, social videos, OG cards, marketing
graphics. Tweaking a headline or recolouring a CTA usually means
re-prompting the agent and hoping it doesn't rewrite the rest.
**artefact-editor** sits on top of whatever the agent wrote and lets you
edit text, images, colours, positions, and timing directly. The source
files stay byte-identical except for the fields you actually changed.

Think of it as Storybook for AI artefacts. Or: the editor a typical agent
output deserves.

## What it edits today

| Adapter                   | Artefact kind                      | How                                                                                  |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `adapter-html`            | HTML/CSS web apps, hyperframes videos | parse5 surgical mutations, inline-style upserts, GSAP-timeline transport bridge   |
| `adapter-image-template`  | PIL marketing graphics (OG cards, LinkedIn posts, etc) | reads `spec.json`, writes back, re-renders via Python; emits a region sidecar for click-to-select |

Each project sits next to a `manifest.json` listing **blocks** (text, image,
colour, audio, timing) and how each block maps back to the source. See
`spec/emission-spec-v1.md` and `spec/agent-prompt-fragment.md` for the
contract emitting agents follow.

## Quickstart

```bash
yarn install
yarn dev                                      # → http://localhost:5173
                                              # picker shows the bundled examples
```

Or build once and run as a single process pointed at your own project(s):

```bash
yarn build
yarn workspace @artefact-editor/cli start ./my-project ./another-project
                                              # → http://localhost:7411
```

If you `yarn link` the CLI workspace (or eventually `npm i -g`):

```bash
artefact-editor ./my-project
```

## Examples (auto-discovered when run from the repo root)

| Folder                          | Kind            | What it shows                                                       |
| ------------------------------- | --------------- | ------------------------------------------------------------------- |
| `examples/og-card-sample`       | image-template  | OG card driven by `spec.json`, click-to-select via PIL bbox sidecar |
| `examples/bp-ai-chat-video`     | hyperframes     | 40-block social video; transport, multi-track timeline, audio sync  |
| `examples/3d-tunnel-flythrough` | hyperframes     | CSS 3D scene reproducing a gojiberry-style fly-through              |
| `examples/hero-landing`         | html-app        | Tiny landing page with text, image, and brand-colour blocks         |
| `examples/sky-uc14ai`           | html-app        | Larger built React/Vite app with 13 blocks across pillars and CTAs  |

## Editing model

Edits become **commands** (`setProperty`, `addBlock`, …) which the adapter
applies to the on-disk source. parse5's source-offset tracking lets the HTML
adapter rewrite a single attribute or text node without reformatting the
file. The image-template adapter writes back to `spec.json`, then the editor
re-runs the PIL template to regenerate the PNG.

PIL templates that opt in (call `self.track(key, x, y, w, h)` during
`_draw_content`) emit an `<output>.layout.json` sidecar at save time. The
editor uses it to overlay click-to-select hit zones on the rendered image,
giving image-template artefacts the same direct-selection feel iframe
artefacts get from the preview bridge.

Hyperframes compositions can pin a representative thumbnail/poster frame
with `data-poster-time="3.5"` on `#root`. Without it, the bridge auto-seeks
to `duration / 2` so the editor doesn't open on a literal blank frame.

## Render & export

- **image-template**: the editor's Render button re-runs the PIL template
  and refreshes the preview.
- **hyperframes**: the editor's Render MP4 button shells to
  `npx hyperframes render --quality draft --output renders/editor-render.mp4`
  and opens the resulting MP4 in a new tab.
- **Any project**: the download button in the top bar streams a
  `<project>.artefact` zip — manifest + source + assets, build artefacts
  excluded. Drop it into another machine's `artefact-editor` to pick up
  exactly where you left off.

## Layout

```
apps/
  cli/             # Hono server + bin. CLI: artefact-editor <project-dir>...
  web/             # Vite + React + TS + shadcn/ui + Tailwind
packages/
  core/            # Format-agnostic. Block, descriptors, Doc, commands.
  adapter-html/    # parse5-based mutations + preview bridge.
  adapter-image-template/  # PIL spec.json adapter, shells to python3.
spec/
  emission-spec-v1.md         # Contract agents follow when emitting artefacts.
  agent-prompt-fragment.md    # Drop-in instructions for the emitting agent.
examples/
  og-card-sample/
  bp-ai-chat-video/
  3d-tunnel-flythrough/
  hero-landing/
  sky-uc14ai/
```

## Status

Used in anger for several real projects (Bayes Price social ads, Sky
UC14AI prototype, OG cards). Adapter API is stable enough for HTML and PIL;
the hyperframes path is the most exercised. The next adapters in line are
likely Remotion and slide decks.

## License

MIT — see [LICENSE](LICENSE).
