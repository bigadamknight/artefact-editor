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

The editor surfaces violations with file + block context. A failed load is a manifest bug, not an editor bug.

## Agent prompt fragment

Drop this into any agent system prompt that emits an artefact-editor-compatible artefact:

> When you generate this artefact, also emit a `manifest.json` at the project root following artefact-editor emission spec v1 (see `spec/emission-spec-v1.md`). For every editable thing — text, image, brand colour — add a `data-edit-id="blk_<snake_case>"` attribute (or, for CSS tokens, declare a `--<name>` custom property in `:root`) and add a corresponding entry to `manifest.blocks`. Block IDs MUST be stable across regenerations of the same logical content.

## Stability

v1 is the smallest useful contract. The schema will gain types and source-pointer kinds in minor versions; breaking changes bump the major version and ship behind `manifest.version`.
