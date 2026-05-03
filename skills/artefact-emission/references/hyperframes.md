# hyperframes artefacts

HTML compositions with a GSAP timeline (videos, animated explainers, social
ads). Same `data-edit-id` tagging rules as `html-app`, plus timeline cue
points and audio metadata.

## Manifest

```json
{
  "version": 1,
  "artefact": "hyperframes",
  "entry": "index.html",
  "name": "Why Platinum, not raw AI? (video)",
  "blocks": [...]
}
```

## What's different from `html-app`

- The editor shows a transport bar (play / pause / scrub), a multi-track
  timeline lane per block, and audio sync.
- The composition's root element should expose width/height (e.g.
  `<div id="root" data-width="1920" data-height="1080">`), so the editor can
  scale the iframe to fit the preview pane.
- Optionally, pin a representative thumbnail/poster frame with
  `data-poster-time="3.5"` on `#root`. Without it, the editor auto-seeks to
  `duration / 2` when the iframe first mounts so the editor doesn't open on a
  literal blank frame.
- Render via the `Render MP4` button in the top bar; under the hood the editor
  shells to `npx hyperframes render --quality draft --output renders/editor-render.mp4`.

## Required emission shapes

1. Expose the timeline at `window.__timelines.<key>` so the bridge script can
   drive transport. The shape it expects:
   ```js
   window.__timelines.main = {
     duration() { /* returns seconds */ },
     time()     { /* returns current seconds */ },
     play()     { /* start */ },
     pause()    { /* stop */ },
     paused()   { /* boolean */ },
     seek(t)    { /* go to seconds t */ },
   };
   ```

2. Tag every `<audio>` with `data-start`, `data-duration`, `data-volume`, and
   give it a stable `id` that the manifest's `audio` block selects.

3. Promote every cue-point timestamp to a top-level `const T1 = 4.0;` (or
   similar) inside the composition's `<script>`. Add a `timing` block per
   constant. The editor renders these as draggable markers on the timeline.

4. Brand colours go in a `:root { --brand: #2DD4BF; }` block. Add a `color`
   block with `cssVar: "--brand"`.

## Block kinds you'll typically emit

| `kind`   | When                                                    |
| -------- | ------------------------------------------------------- |
| `text`   | Per scene line, headline, caption                       |
| `image`  | Logos, hero shots                                       |
| `audio`  | Each music/voiceover track (one block per `<audio>`)    |
| `timing` | Each `Tn` constant in the timeline script               |
| `color`  | Each editable `--*` token in `:root`                    |
