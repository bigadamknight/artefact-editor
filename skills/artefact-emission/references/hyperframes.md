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

5. Mark every GSAP-driven scene container with passive scene attributes. The
   HyperFrames runtime ignores them; only artefact-editor reads them, for
   `GET /api/projects/:id/scenes` and for `strip?scene=` / `onion?scene=`.

   | Attribute | Required | Meaning |
   |---|---|---|
   | `data-scene` | yes | Scene id, unique in the file, matching `[A-Za-z0-9_-]+` |
   | `data-scene-start` | yes | Seconds, or the NAME of a top-level `const` whose value is a numeric literal in the file's `<script>` (e.g. `T2`) |
   | `data-scene-end` | no | Same forms. Defaults to the next marked scene's start in document order; the last scene ends at the root `data-duration`. |
   | `data-label` | no | Display label. Defaults to the id. |

   Rules:

   - The markers are passive. The HyperFrames runtime ignores them and they change no rendered frame. Only artefact-editor reads them (`GET /api/projects/:id/scenes`, `strip?scene=`, `onion?scene=`).
   - **Never** add `data-start`, `data-duration` or `class="clip"` to a GSAP-driven scene. `data-start` hands visibility to the runtime, which injects `visibility:hidden` and toggles it per seek, cutting GSAP fades.
   - Do not add an `id` to a scene div for this. Studio derives a draggable clip from root children that have ids, and a drag writes `data-start`.
   - Prefer the const name over a literal, so a timing-block edit moves the scene and the GSAP timeline together.
   - The const must be a numeric literal: `const T3 = T2 + 7` does not resolve, and that scene is dropped.
   - Document order must be time order.
   - Scenes inside a sub-composition file are marked in that file, in its local time.
   - Compositions built from `data-start` clips need no markers.

   Canonical snippet:

   ```html
   <script>const T2 = 5.25;</script>
   <div class="scene s2" data-scene="s2" data-scene-start="T2" data-label="3D cube">
   ```

## Block kinds you'll typically emit

| `kind`   | When                                                    |
| -------- | ------------------------------------------------------- |
| `text`   | Per scene line, headline, caption                       |
| `image`  | Logos, hero shots                                       |
| `audio`  | Each music/voiceover track (one block per `<audio>`)    |
| `timing` | Each `Tn` constant in the timeline script               |
| `color`  | Each editable `--*` token in `:root`                    |
