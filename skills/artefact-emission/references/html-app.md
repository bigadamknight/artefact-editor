# html-app artefacts

Static or built HTML/CSS/JS web pages. The editor parses `index.html` with
parse5 and applies surgical edits — only the bytes corresponding to the user's
change move; the rest of the file stays byte-identical.

## Manifest

```json
{
  "version": 1,
  "artefact": "html-app",
  "entry": "index.html",
  "name": "Hero landing",
  "blocks": [...]
}
```

## What can be edited

- Text content of any element with `data-edit-id`
- `src` and `alt` of `<img>` elements
- Any inline `style.*` property (the editor handles upserts on the `style` attribute)
- Top-level numeric `const`/`let`/`var` in `<script>` blocks via `astVar` source pointers
- CSS custom properties via `cssVar` source pointers (look up the variable in
  any `:root` block reachable from `index.html`)

## Built apps (Vite, Next, etc.)

If the project is a built React app, the rendered text usually lives in *two*
places: the static HTML and the JS bundle. The editor handles this
automatically — it edits `index.html` first, then mirrors the same string swap
into any sibling `.js`/`.mjs`/`.css` files using quote-aware matching with
unique-substring fallback. You don't need to declare bundle paths in the
manifest.

The implication for emission: just make sure `data-edit-id` ends up on the
element in the rendered output (not erased by the build), and write the
manifest pointing at it. The dual-file mirroring is invisible.

## When to choose `html-app` vs `hyperframes`

Pick `html-app` if there's no GSAP timeline. Pick `hyperframes` if the page
animates over time with a `__timelines` object exposed on `window` — the editor
gives you scrubber + transport + per-block timeline lanes when it sees
`hyperframes`.
