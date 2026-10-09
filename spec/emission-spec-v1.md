# Artefact Emission Spec v1

This spec defines what an AI agent (or any tool) emits so that artefact-editor can open it and let a user make direct edits without going back to the agent.

The artefact is a directory. The editor reads it; the agent writes it; the user edits it. All three agree on this format.

## Directory layout

```
<project>/
├── manifest.json          # REQUIRED — the editor's index of editable blocks
├── <entry-file>           # REQUIRED — the artefact's main file (referenced by manifest.entry)
├── <other source files>   # OPTIONAL — referenced from manifest.blocks[].source.file
└── assets/                # OPTIONAL — bundled images, fonts, etc.
```

## `manifest.json`

```jsonc
{
  "version": 1,
  "artefact": "html-app",            // adapter id; v1 supports "html-app"
  "entry": "index.html",             // file to load in the preview iframe
  "name": "Hero Landing",            // optional, displayed in the editor
  "blocks": [
    {
      "id": "blk_hero_title",        // STABLE across regenerations. Required. Format: blk_<snake_case>.
      "kind": "text",                // text | image | color
      "label": "Hero headline",      // human-readable, shown in inspector
      "source": {
        "file": "index.html",
        "selector": "[data-edit-id=blk_hero_title]"
      },
      "properties": [
        { "key": "text", "type": "string", "multiline": false }
      ]
    },
    {
      "id": "blk_hero_image",
      "kind": "image",
      "label": "Hero image",
      "source": {
        "file": "index.html",
        "selector": "[data-edit-id=blk_hero_image]"
      },
      "properties": [
        { "key": "src", "type": "asset", "mime": ["image/*"] },
        { "key": "alt", "type": "string" }
      ]
    },
    {
      "id": "blk_brand_primary",
      "kind": "color",
      "label": "Brand primary",
      "source": {
        "file": "styles.css",
        "cssVar": "--brand-primary"
      },
      "properties": [
        { "key": "value", "type": "color" }
      ]
    }
  ]
}
```

### Block IDs

- Required, unique within a manifest.
- Stable across regenerations: if the agent re-emits the same logical block, it MUST use the same ID. This is the merge protocol's foundation.
- Format: `blk_<snake_case>`.

### Source pointers

Tagged by which key is present. v1 supports two:

| Tag | Fields | Applies to |
|---|---|---|
| `selector` | `{ file, selector }` | DOM elements in HTML files. Selector MUST be unique within `file`. |
| `cssVar` | `{ file, cssVar }` | CSS custom properties. The variable MUST be declared in a `:root` rule (or any rule with at most one declaration of that variable). |

Future extensions (not in v1): `astPath` (JSX nodes), `jsonPointer`, `markdownAnchor`.

### Property descriptors

```jsonc
{ "key": "text",  "type": "string",   "multiline": false }
{ "key": "alt",   "type": "string" }
{ "key": "src",   "type": "asset",    "mime": ["image/*"] }
{ "key": "value", "type": "color" }
{ "key": "size",  "type": "number",   "min": 0, "max": 100, "step": 1 }
{ "key": "align", "type": "enum",     "options": ["left", "center", "right"] }
```

v1 ships `string`, `asset`, `color`. The other types are reserved.

## Source-file requirements

### HTML

- Every block whose source is `selector` MUST resolve to exactly one element.
- The convention is `[data-edit-id="<block-id>"]`. Other selectors are allowed but the agent SHOULD prefer `data-edit-id` because it's robust to class/structure changes.
- For `kind: "text"`: the element's editable content is its **direct text content** (concatenated text nodes that are direct children). Inner elements are preserved.
- For `kind: "image"`: the element MUST be an `<img>`.
- The artefact MUST function correctly when opened directly in a browser (no editor injection required for runtime).

### Scenes (hyperframes)

GSAP-driven HyperFrames videos build their scenes as `<div class="scene s2">`, with the timing kept in the GSAP script. Mark each scene container with passive attributes:

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

### CSS

- A `cssVar` source MUST resolve to exactly one declaration of that variable in the file. Declare brand tokens in `:root { ... }`.

## Validation

The editor runs these checks on open and refuses to load if any fail:

1. `manifest.json` parses and matches the v1 schema.
2. `entry` file exists.
3. Every `source.file` exists.
4. Every block resolves to exactly one source location.
5. Block IDs are unique.
6. Property `key`s are unique within a block.

The editor does not validate scene markers when a project opens. The review routes (`/scenes`, `strip?scene=`, `onion?scene=`) read them, and a scene with a missing or unresolvable `data-scene-start` is dropped from the list.

The editor surfaces violations with file + block context. A failed load is a manifest bug, not an editor bug.

## Agent prompt fragment

Drop this into any agent system prompt that emits an artefact-editor-compatible artefact:

> When you generate this artefact, also emit a `manifest.json` at the project root following artefact-editor emission spec v1 (see `spec/emission-spec-v1.md`). For every editable thing — text, image, brand colour — add a `data-edit-id="blk_<snake_case>"` attribute (or, for CSS tokens, declare a `--<name>` custom property in `:root`) and add a corresponding entry to `manifest.blocks`. Block IDs MUST be stable across regenerations of the same logical content.

## Stability

v1 is the smallest useful contract. The schema will gain types and source-pointer kinds in minor versions; breaking changes bump the major version and ship behind `manifest.version`.
