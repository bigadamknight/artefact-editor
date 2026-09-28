# Third-party notices

artefact-editor is MIT-licensed (see [LICENSE](LICENSE)). It depends on the
components below under their own licenses. Every other npm dependency keeps
the license in its own `node_modules/<package>` folder.

## HyperFrames (HeyGen, Inc.) — Apache License 2.0

- Packages: `@hyperframes/studio`, `@hyperframes/studio-server`,
  `@hyperframes/core`, `@hyperframes/player`, `@hyperframes/sdk`,
  `@hyperframes/parsers`, `@hyperframes/lint`,
  `@hyperframes/shader-transitions`, all at 0.8.81, from npm.
- Source: https://github.com/heygen-com/hyperframes
- Copyright 2026 HeyGen, Inc.
- Full license text: [packages/adapter-hyperframes/LICENSE.hyperframes](packages/adapter-hyperframes/LICENSE.hyperframes)

Where used:

- `packages/adapter-hyperframes` serves the timeline's file, preview and
  history API with `@hyperframes/studio-server` and `@hyperframes/core`.
- `apps/timeline` mounts the timeline, preview player and editing hooks
  from `@hyperframes/studio`, and its production build bundles them.

Modified or adapted files carry a header that names the upstream file:

- `apps/timeline/src/lib/timelineEditCallbacks.ts` — adapted from
  `packages/studio/src/components/nle/useTimelineEditCallbacks.ts` and
  `packages/studio/src/hooks/timelineMoveAdapter.ts`.
- `packages/adapter-hyperframes/src/studioApi.ts` — the preview bundle
  step follows `packages/cli/src/server/studioServer.ts`.

The timeline app uses none of the upstream product's names, logos or marks.
Studio's telemetry is turned off in `apps/timeline/index.html` and
`apps/timeline/vite.config.ts`.

## Mediabunny — Mozilla Public License 2.0

- Package: `mediabunny` (a dependency of `@hyperframes/studio`), bundled
  unmodified into the `apps/timeline` production build.
- Source: https://github.com/Vanilagy/mediabunny
- License: https://mozilla.org/MPL/2.0/

The MPL-2.0 covers mediabunny's own files only. Its source is available at
the repository above; artefact-editor does not modify it.
