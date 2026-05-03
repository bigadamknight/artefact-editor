# Editframe sample (artefact-editor)

This example shows that artefact-editor sits above any HTML-based video
framework. The structure here is Editframe's `<ef-timegroup>` /
`<ef-text>` element model. Selectors target `data-edit-id` attributes on
the `<ef-text>` nodes, and the `html-app` adapter handles the surgical
edits.

A full Editframe project would also bring in `@editframe/elements`,
`@editframe/vite-plugin`, and a build step. This example strips those out
and inlines styles so the iframe renders something useful without a build.
The editing model is identical either way — only the runtime differs.

To turn this into a real Editframe project, restore the original
`package.json`, `vite.config.ts`, and `src/` from the
`@editframe/create` `html` template, run `npm install`, and re-add
`data-edit-id` attributes to the elements you want to be editable.
