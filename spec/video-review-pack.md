# Video review pack — plan

Approved by Adam on 2026-10-09 (asks 331 and 332). The ideas come from fframes (MIT, github.com/dmtrKovalenko/fframes): onion skin, scene contact sheet, and a filmstrip timeline. No fframes code is copied.

## Goal

Every HyperFrames clip and the root composition show real frames in the timeline. An onion-skin PNG and a labelled contact-sheet PNG are available in the timeline UI and from `GET /api/projects/:id/{onion,strip,frame,scenes}`. One server-side frame-capture primitive produces all of them.

## Approach

There is one capture primitive on the server: a resident headless Chrome (`puppeteer-core`). It does the following:

1. Load studio-server's own preview URL (`/api/projects/:id/preview[/comp/<path>]`).
2. Wait for `window.__renderReady`.
3. Seek with the HyperFrames runtime cascade: `__player.renderSeek` → `__hf.seek` → `__timelines[*].seek`.
4. Settle: `__hfWaitForSeekCompletion`, then a double rAF, then `document.fonts.ready` capped at 500 ms.
5. Screenshot, optionally clipped to a selector via `@hyperframes/studio-server`'s `getElementScreenshotClip`.

Upstream Studio does exactly this; artefact-editor dropped it. The installed 0.8.81 packages already contain the rest:

- Studio's client side: `CompositionThumbnail`, the thumbnail scheduler and `thumbnailRevisions`.
- studio-server's thumbnail route: a `.thumbnails/` disk cache keyed by source hash, input signature, `t` and selector, serialised by a coordinator.

So wiring `generateThumbnail` for non-video elements turns on the whole per-clip pipeline with no new cache code. Onion and strip reuse the same primitive and composite with `sharp`.

The timeline gets a true filmstrip: N frames at distinct times. The tile count follows the clip's pixel width. Tile times snap to a power-of-two seconds grid so that zoom changes hit the cache. A root-composition strip row is aligned to the lanes via `useTimelineContext().state.canvas.pps`.

Rejected alternatives:

- **Capturing in the browser.** A cross-document iframe cannot be drawn to a canvas, and `html-to-image`-style serialisation loses web fonts, 3D transforms, `<video>` frames and shaders. It would also stall the interactive preview, would not be reproducible across machines, and would not serve the agent endpoints.
- **Shelling out to `npx hyperframes motion-shot`.** That command exists in CLI 0.8.140, not 0.8.81. It starts a fresh Chrome per call, drifts from the pinned 0.8.81 runtime, and cannot feed the timeline thumbnail route.

Editframe is deferred, for three reasons:

- Editframe projects do not open in the timeline app (`packages/editor/src/ArtefactEditor.tsx:91-96`).
- They have no studio-server routes.
- The runtime seek contract is `<ef-timegroup>.seek(ms)`, with no ready or seek-completion signals.

Decisions:

- The timeline app keeps the Studio UI kit (`Button`, `IconButton`, `NumberField`, `Popover`) and plain `.ae-*` CSS. No shadcn is added there.
- A missing Chrome returns 503 with an install hint. The app never auto-installs a browser.
- Scene marking in the emission spec is a separate follow-up (fleet todo td-22). (superseded 2026-10-09: scenes are now marked with `data-scene`, see emission-spec-v1.md)

## Steps

### Server: `packages/adapter-hyperframes`

1. **`package.json`**: add dependencies `puppeteer-core` (^25), `@puppeteer/browsers` (^3) and `sharp` (^0.33.5, the same as root so yarn dedupes). Add the devDependency `@hono/node-server` (^1.13.7) for the capture tests.

2. **New `src/chromeExecutable.ts`**: `resolveChromeExecutable(): Promise<{ path; source: "env" | "hyperframes-cache" | "puppeteer-cache" | "system" } | null>`. Memoise the result for the process lifetime. Resolution order:
   1. `HYPERFRAMES_BROWSER_PATH` or `PUPPETEER_EXECUTABLE_PATH`, if the file exists.
   2. `getInstalledBrowsers({ cacheDir: ~/.cache/hyperframes/chrome })`: prefer `Browser.CHROMEHEADLESSSHELL`, the newest buildId, and the current platform.
   3. The same lookup in `~/.cache/puppeteer`.
   4. System Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, then `google-chrome` or `chromium` on PATH.
   5. Otherwise null.

3. **New `src/frameCapture.ts`**: the capture primitive.
   ```ts
   export interface FrameCaptureRequest {
     previewUrl: string;            // absolute http URL of the studio preview
     version: string;               // page-pool key: project signature (+ comp path)
     times: number[];               // composition seconds; sorted ascending by the primitive
     fps: number;                   // quantise t to Math.round(t*fps)/fps
     width: number; height: number; // composition size → viewport
     deviceScaleFactor: number;     // thumbnailDeviceScaleFactor() for thumbnails, `scale` for review images
     selector?: string; selectorIndex?: number;
     format: "png" | "jpeg";
     signal: AbortSignal;
   }
   export function captureFrames(req: FrameCaptureRequest): Promise<(Buffer | null)[]>;
   export function closeFrameCapture(): Promise<void>;
   ```
   Rules:
   - **One browser.** Launch it lazily with `puppeteer-core.launch({ headless: true, executablePath, args: ["--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] })`. Close it after 60 s idle and on `process.on("exit")` or SIGINT.
   - **One page per `previewUrl`.** Reuse the page only while `version` is unchanged and the requested times are at or after the last captured time. Otherwise:
     - `page.goto(previewUrl, { waitUntil: "domcontentloaded", timeout: 10000 })`
     - `waitForFunction(() => window.__renderReady === true)` for 5 s, falling back to `__timelines` being non-empty.
   - **One queue.** All work goes through one in-module promise queue.
   - **Seek and settle.** Transcribe the seek cascade and settle from the HyperFrames CLI's `seekCompositionTimeline` (Apache-2.0).
   - **Selector captures.** With `selector`, run `getElementScreenshotClip(selector, selectorIndex)` and pass `clip` to `page.screenshot`. Read its body in `node_modules/@hyperframes/studio-server/dist` first. If it mutates the DOM, drop the page after a selector capture.
   - **No Chrome.** If no executable resolves, throw an exported `ChromeUnavailableError`.

4. **New `src/scenes.ts`**: walk the composition with parse5, following the walker pattern in `videoThumbnail.ts`.
   - Read the root `data-duration`, `data-width`, `data-height` and `data-fps` (default 30).
   - List the timed children (`data-start` present, tag not `audio`) as `{ id, label: data-label ?? id, start, duration, selector: "#"+id, kind: "video" | "composition" | "element", comp }`.
   - Sub-compositions (`data-composition-src`) use their own file as `comp`, with local time 0.
   - When no timed child exists, return one synthetic scene: `{ id: "root", label: <root data-composition-id>, start: 0, duration }`.
   - Export `listScenes(projectDir, compPath)`.
   - Export `resolveRange(scenes, { scene?, from?, to?, duration })`. It returns `{ from, to }` or an error string: `from < to` is required, and both values are clamped to `[0, duration]`.

5. **New `src/reviewImages.ts`**: pure `sharp` compositing, with no Chrome.
   - **`composeOnion(frames, { width, height, label })`**: start from a black base. Composite the frames in time order with `ensureAlpha(alpha)`, where `alpha[i] = 0.14 + 0.86 * i/(n-1)` (n = 1 gives 1), using `blend: "over"`. Draw the label bottom-left from an SVG overlay.
   - **`composeContactSheet(cells: { frame; label }[], { columns, cellWidth, aspect, title })`**: lay the cells out in a grid with an 8 px gutter. Each cell has a timestamp caption band (`t=1.25s`) and the sheet has a title row. Output is PNG.

6. **New `src/reviewRoutes.ts`**: `registerReviewRoutes(api, { resolveProject, capture, previewUrlFor })`.

   All routes are GET. All of them take `comp=` (default `index.html`), `selector=` and `selectorIndex=`.

   | Route | Returns | Parameters |
   |---|---|---|
   | `/projects/:id/scenes` | JSON `{ comp, fps, duration, width, height, scenes }` | — |
   | `/projects/:id/frame` | one image | `t=1.5`, `scale=1`, `format=png\|jpeg` |
   | `/projects/:id/onion` | PNG | `from=&to=` or `scene=`; `n` 1..24, default 6; `scale` (0,1], default 0.5 |
   | `/projects/:id/strip` | PNG | `from=&to=` or `scene=`; `n` 1..64, default 12; `columns` 1..8, default `min(4, n)`; `width` 120..960, default 480 |

   Onion details:
   - Frame times are `from + i/(n-1)*(to-from)`, rounded to 1 ms. The primitive then quantises them to fps.
   - The label reads `onion · 6 frames · t 1.00–2.00s`.

   The strip title reads `<project> · <comp> · <scene label or range>`.

   Errors:
   - 400 for bad parameters, as JSON `{ error }`.
   - 404 for an unknown project or comp.
   - 503 `{ error: "headless Chrome not found", hint: "npx @puppeteer/browsers install chrome-headless-shell, or set HYPERFRAMES_BROWSER_PATH" }` on `ChromeUnavailableError`.
   - 499 on abort.

   Caching:
   - `key = sha1(createProjectSignature(project.dir) + comp + route + sorted query)`.
   - The file is `<project>/.thumbnails/review-<key>.png`.
   - Responses carry `ETag: "<key>"` and `Cache-Control: no-cache`, and return 304 on a matching `If-None-Match`.
   - studio-server's `pruneThumbnailCache` already prunes `.thumbnails/`.

   `previewUrlFor` mirrors studio-server's thumbnail route: `http://<host header>/api/projects/<id>/preview` for `index.html`, and `.../preview/comp/<encoded path>` otherwise. Fall back to `localhost` when there is no host header.

7. **`src/studioApi.ts`**: change `generateThumbnail`.
   - Keep `videoClipThumbnail` first. When it returns null, call `captureFrames` with these values:
     - `previewUrl: opts.previewUrl`
     - `version: createProjectSignature(...)`
     - `times: [opts.seekTime]`
     - `fps`: the root `data-fps`
     - `width`, `height`
     - `deviceScaleFactor: thumbnailDeviceScaleFactor(opts)`
     - `selector`, `selectorIndex`, `format`, `signal`
   - Return `[0] ?? null`.
   - On `ChromeUnavailableError`, log once and return null.
   - Mount `registerReviewRoutes` before `api.route("/", createStudioApi(adapter))`.
   - Update the comment "Video clips only … no headless browser".

8. **`src/index.ts`**: export `closeFrameCapture`, `ChromeUnavailableError`, `listScenes` and `Scene`.

### Timeline app: `apps/timeline`

This app uses React 19 without the React compiler, and Studio UI primitives.

9. **New `src/lib/filmstrip.ts`**: pure functions.
   - `filmstripTiles({ start, duration, pps, fps, tileHeight = 66, aspect = 16/9 })` returns `{ tileW, tileSeconds, tiles: { t, x }[] }`:
     - `tileW = round(tileHeight*aspect)`
     - `tileSeconds = 2^round(log2(tileW/pps))`, clamped to [1/16, 64]
     - tile times are `t = start + (i + 0.5)*tileSeconds`, quantised to fps
     - `x = (t - start - tileSeconds/2) * pps`
   - `thumbnailUrl(projectId, comp, { t, selector, selectorIndex, w, h, revision })` builds `/api/projects/<id>/thumbnail/<comp>?t=<t.toFixed(2)>&v=v3&w=&h=&revision=&selector=`. These are the same parameters as Studio's `buildCompositionThumbnailUrl`.

10. **New `src/lib/thumbnailCache.ts`**: `createThumbnailCache(max = 500)` returns `{ get(url): Promise<string> }`, resolving to object URLs.
    - Fetch with an `AbortController`.
    - Dedupe requests that are in flight.
    - Keep insertion order in a `Map`. Over `max`, revoke and drop the oldest half.

11. **New `src/components/SceneFilmstrip.tsx`**: props `{ tiles, tileW, tileH, urlFor, cache, visibleFrom, visibleTo, label, labelColor }`.
    - Render absolutely positioned `<img>` tiles only within `[visibleFrom - tileSeconds, visibleTo + tileSeconds]`.
    - Show a pulse placeholder while a tile loads.
    - The component does no fetching itself.

12. **New `src/components/SceneStripRow.tsx`**: a row for the root composition. GSAP-only projects such as `examples/showreel` need it.
    - Render it inside `Timeline.Provider`.
    - Read `useTimelineContext().state.canvas` (`pps`, `contentOrigin`, `trackContentWidth`, `visibleTimeRange`, `effectiveDuration`), and `duration` from `usePlayerStore`.
    - Position it at `left: contentOrigin` with `width: trackContentWidth` and a height of 66 px.
    - Clicking a tile seeks (`onSeek(t)`).

13. **`src/components/TimelineEditor.tsx`**: replace `<Timeline …/>` with the explicit composition that Studio's `TimelineComposed` performs (`node_modules/@hyperframes/studio/dist/index.js` around 25832–25848). The tree:
    ```
    Timeline.Provider
      <div {...meta.containerProps}>
        <div {...meta.viewportProps}>
          Timeline.Frame
          SceneStripRow        (after the Frame, so the sticky ruler is unaffected)
          Timeline.RazorGuide
      Timeline.Overlays
    ```
    - Render `Timeline.EmptyState` when `!timelineReady`.
    - `meta` comes from `useTimelineContext()` inside a small `TimelineView` child.
    - Add the slots `previewOverlay` (onion) and `panel` (contact sheet).

14. **`src/hooks/useTimelineEditor.ts`**:
    - **(a) Clip content.** Wrap `renderClipContent`:
      - For `video`, `audio` and `img`, delegate to Studio's renderer.
      - Otherwise, return a `SceneFilmstrip` fed by `filmstripTiles`. Use the clip's pixel width from a ResizeObserver, with `pps = containerWidth / el.duration`.
      - Take the composition `w`/`h` from the store. Use `comp = el.compositionSrc ?? "index.html"`, with local times for sub-compositions.
    - **(b) Invalidation.** Call `usePlayerStore.getState().bumpThumbnailRevisions(null)` and bump a local `revision` counter in three places:
      - after every successful `writeProjectFile`
      - in `handleAfterUndoRedo`
      - in `handleHostMessage` on `ae:refresh-preview`
    - **(c) Iframe.** Expose `player.liveIframe` as state for the onion overlay.

15. **New `src/hooks/useReviewTools.ts`**:
    - **State:** `onion: { on, n }`, `strip: { open, n, columns }`.
    - **Range (derived, not stored):**
      1. the selected element's `[start, start+duration]`
      2. otherwise `rangeSelection`
      3. otherwise `[time - 0.5, time + 0.5]`, clamped
    - **Returns:**
      - `onionUrl` and `stripUrl`, with `revision` appended.
      - The handlers `handleToggleOnion`, `handleSetOnionCount`, `handleOpenStrip`, `handleCloseStrip`, `handleSetStripCount` and `handleSetStripColumns`.
      - `rangeLabel`.

16. **New `src/components/OnionOverlay.tsx` and `src/components/ContactSheetPanel.tsx`**:
    - `OnionOverlay({ src, iframe, n, onSetCount, onClose })` uses `usePreviewCompositionRect` to sit exactly over the composition. The image has `pointer-events: none`. A small floating control sets the count (3–12) and closes the overlay.
    - `ContactSheetPanel({ src, n, columns, rangeLabel, onSetCount, onSetColumns, onClose })` is an `.ae-panel` that shows the image, with "Open image" and "Copy URL" actions.
    - Both use Studio `Button`, `IconButton` and `NumberField`, and lucide icons. No brand strings: the branding test checks for them.

17. **`src/components/TransportControls.tsx`, `src/pages/TimelinePage.tsx` and `src/theme.css`**:
    - Add two `IconButton`s after the time readout: Onion (`Layers`, with `aria-pressed`) and Contact sheet (`LayoutGrid`).
    - The page wires `useReviewTools` and passes `previewOverlay` and `panel`.
    - Add the CSS classes `.ae-strip-row`, `.ae-onion`, `.ae-onion__controls`, `.ae-panel` and `.ae-panel__image`.

### Tests

18. Test files, and what each must cover:
    - **`packages/adapter-hyperframes/src/frameCapture.test.ts`**: skip it if no Chrome resolves. Serve a temp copy of `examples/hyperframes-timeline-sample` through `createHyperframesStudioApi` with `@hono/node-server` on an ephemeral port, then check:
      - The PNG is 1620x1080 at scale 1.
      - Two captures at `t=1` are byte-identical.
      - `selector=#captions` gives a clip smaller than the full frame.
      - A backward seek after a forward one is still a valid PNG.
    - **`reviewImages.test.ts`**:
      - The blended centre pixel of three solid PNGs is correct.
      - Contact sheet width = `columns*cellWidth + gutters`.
      - `n=1` gives alpha 1.
    - **`reviewRoutes.test.ts`** uses a fake `capture`. Check that:
      - `/scenes` lists `captions` (start 0, duration 14.52, kind composition).
      - `/scenes` returns a synthetic `root` when the composition has no timed children.
      - `onion` returns 200 `image/png`.
      - `n=99` clamps to 24.
      - `from>=to` returns 400.
      - An unknown comp returns 404.
      - `ChromeUnavailableError` returns 503.
      - A matching `If-None-Match` returns 304.
      - A write to `index.html` changes the ETag.
    - **`studioApi.test.ts`**:
      - The thumbnail route answers 200 `image/jpeg` for `#captions` (skip if no Chrome).
      - The video clip `#lion-close` is still served when Chrome is unavailable.
    - **`apps/timeline/src/lib/filmstrip.test.ts`**:
      - The tile count grows with `pps`.
      - `tileSeconds` is a power of two.
      - Two `pps` values in the same bucket give identical URLs.
      - Tile times are quantised to fps.
    - **`thumbnailCache.test.ts`**:
      - The 501st insert leaves 250 entries and revokes the oldest.
      - In-flight requests are deduped.
    - **`useReviewTools.test.tsx`** (happy-dom):
      - The range comes from the selection, then from `rangeSelection`, then from the playhead.
      - The URL contains `n` and `revision`.
    - **`useTimelineEditor.test.tsx`**: extend it to assert that `thumbnailRevisions` changes after a write and after undo.
    - **`branding.test.tsx`**: stays green.

### Docs and notices

19. Documentation updates:
    - **`THIRD_PARTY_NOTICES.md`**: add two lines:
      - `frameCapture.ts` follows the HyperFrames CLI `seekCompositionTimeline` seek-and-settle sequence.
      - The thumbnail LRU policy follows fframes (MIT), with no code copied.
    - **`README.md`**: add a "Review" subsection listing the endpoints, with a curl example.
    - **`AGENTS.md` and `CLAUDE.md`**: say that thumbnails need Chrome (resolution order, env var), list the new files, and describe the Studio-parts composition in `TimelineEditor.tsx`.

## Pitfalls

- **Hono route order.** The adapter is mounted last in `apps/cli/src/index.ts` (around 598–608). Register the review routes inside the adapter's `api`, before `createStudioApi`.
- **No host header.** `studioApi.test.ts` and `useTimelineEditor.test.tsx` build the adapter without a host header, so `previewUrlFor` must fall back to `localhost`.
- **Cache key rounding.** The thumbnail route's cache key uses `seekTime.toFixed(2)`. Filmstrip tile times must use the same two-decimal rounding, or every zoom step misses the cache.
- **Stale client cache.** Studio's thumbnail scheduler keys its client cache by URL. Without the `revision` bump, a text edit leaves stale frames.
- **Don't reuse `CompositionThumbnail`** for the filmstrip, because it repeats one poster frame. Keep delegating to Studio's `VideoThumbnail` and `AudioWaveform` for media clips.
- **GSAP-only examples.** In `showreel`, `promo-*` and `bp-ai-chat-video`, the `.scene` divs have no `data-start`. `/scenes` therefore returns the synthetic root, and the strip row is what shows these projects. Captures of `selector=.s2` are blank at times when the scene is hidden. Document this; don't special-case it. (superseded 2026-10-09: scenes are now marked with `data-scene`, see emission-spec-v1.md)
- **Backward seeks.** GSAP `from()` and `set()` are not reliably reversible. Drop the page on a backward seek, and sort batch times ascending.
- **Looping timelines.** A looping timeline (`repeat: -1`, which reports 1e10 s) or a timeline built after load needs the `__renderReady` wait. Cap `to` at the root `data-duration`.
- **CSS animations.** CSS `animation:` keyframes and `@property` transitions are not driven by a GSAP seek, so frames can vary. Accept this, and keep the fps quantisation.
- **Fonts.** Google Fonts load over the network. The `document.fonts.ready` wait is capped at 500 ms.
- **H.264 inside HTML scenes.** Chrome for Testing and headless-shell lack the proprietary codecs. The preview route proxies or transcodes through `?hf-proxy=` when ffmpeg is present. Verify that the root strip of `hyperframes-timeline-sample` shows video frames. If they are black, use `HYPERFRAMES_BROWSER_PATH` with system Chrome and document it in CLAUDE.md.
- **Thumbnail scale.** Use `thumbnailDeviceScaleFactor`, so the thumbnail renders at a small scale rather than as a full-size screenshot that is then resized.
- **Concurrency.** Onion and strip bypass studio-server's `ThumbnailGenerationCoordinator(1)`, so the primitive's own queue protects Chrome. Onion is capped at 24 frames and strip at 64. The filmstrip requests only visible tiles ± one.
- **Archive.** `.thumbnails/*` is already excluded from the `.artefact` archive (`apps/cli/src/index.ts:456`).
- **Orphan Chromes.** `tsx watch` restarts the CLI on edits, so exit cleanup and the idle close are both required.
- **Package placement.** `apps/timeline` is React 19 with `nohoist`. `puppeteer-core` and `sharp` go in `packages/adapter-hyperframes` only. Never import `@hyperframes/studio-server` into the timeline's runtime code.
- **Branding test.** `branding.test.tsx` greps the rendered output for `hyperframes|heygen`. New labels and `aria-label`s must not contain either word.

## Acceptance

- `GET /api/projects/hyperframes-timeline-sample/thumbnail/index.html?t=1&selector=%23captions&w=1620&h=1080` returns 200 `image/jpeg`. Before this change it returned 500.
- The same request with `#lion-close` returns 200 without launching Chrome.
- `GET /api/projects/showreel/scenes` returns `fps`, `duration` 36.5, `width` 1920, `height` 1080 and one synthetic `root` scene. (superseded 2026-10-09: scenes are now marked with `data-scene`, see emission-spec-v1.md)
- `GET /api/projects/hyperframes-timeline-sample/scenes` lists `captions` with `kind: "composition"`, `start` 0 and `duration` 14.52.
- `GET /api/projects/showreel/onion?from=0.2&to=1.2&n=6` returns a 960x540 PNG with an `ETag`.
- Repeating it with `If-None-Match` returns 304. Editing `index.html` changes the ETag.
- `GET /api/projects/showreel/strip?n=12&columns=4&width=480` returns a PNG of width `4*480 + 5*8`, with a `t=` caption on each cell.
- Validation: `n=99` on onion captures 24 frames, `from>=to` returns 400, and a missing comp returns 404.
- With `HYPERFRAMES_BROWSER_PATH=/nonexistent` and no cached browsers, the review routes return 503 with a hint, and video thumbnails still work.
- Two captures at the same `t` produce byte-identical PNGs.
- In the timeline:
  - For `hyperframes-timeline-sample`, the `captions` clip shows frames, and zooming in increases the number of distinct tiles.
  - For `showreel`, the strip row under the lanes scrolls with them, and clicking a tile seeks.
  - Saving a text block from the editor sidebar makes the tiles refetch with a new `revision`.
- The Onion button overlays a blended PNG aligned to the composition. The preview stays interactive.
- The Contact sheet button opens a panel for the selection, the range selection, or ±0.5 s around the playhead.
- `yarn typecheck` and the adapter-hyperframes and timeline test suites pass, including `branding.test.tsx`.
- No file in `apps/web` or `packages/editor` changes.

## Verify

```
yarn typecheck
yarn workspace @artefact-editor/adapter-hyperframes test   # baseline before this work: 10 pass
yarn workspace @artefact-editor/timeline test              # baseline before this work: 3 pass
yarn dev                                                   # cli 7411, web 5173, timeline 5174
curl -s 'http://localhost:7411/api/projects/showreel/scenes'
curl -s -o onion.png -D - 'http://localhost:7411/api/projects/showreel/onion?from=0.2&to=1.2&n=6'
curl -s -o strip.png 'http://localhost:7411/api/projects/showreel/strip?n=12&columns=4&width=480'
```

Browser checks (dev-browser):

1. Open `http://localhost:5173/#/p/showreel`. Check the strip row, the zoom behaviour, the Onion overlay and the Contact sheet panel.
2. Edit "S1 eyebrow", save, and confirm the tiles refetch.
3. Open `#/p/hyperframes-timeline-sample`. Check that the `captions` clip shows frames and that the root strip shows video frames, not black.
