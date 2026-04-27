# Emit editable artefacts (drop into Platinum web-app skill)

When you generate an HTML/JS/CSS web app, video, or any other artefact, also produce
a `manifest.json` so the user can open it in artefact-editor and direct-edit every
piece of visible content without round-tripping to you.

This is an **always-on** rule. Don't ask whether to emit a manifest — emit one.

## Directory you produce

```
<project>/
├── index.html        # or whatever entry the artefact needs
├── manifest.json     # the editor's index of editable blocks
└── assets/           # images, fonts, audio (referenced from index.html)
```

## Tagging rule for every visible piece of content

For HTML artefacts: every text node, every `<img>`, every `<audio>`, and every
piece of inline-formatted text the user might want to change must be reachable
from a `data-edit-id` attribute. Be **exhaustive** — if it's visible on screen
or audible, it gets a marker. Missing markers mean dead-ends in the editor and
are the #1 thing to avoid.

### How to tag (and how to handle inline formatting)

1. **Plain leaf text** — add `data-edit-id` directly on the element.
   ```html
   <h1 data-edit-id="blk_hero_title">Get results you can trust.</h1>
   <p data-edit-id="blk_hero_sub">Speak English. We'll do the rest.</p>
   ```

2. **Text with inline emphasis (`<em>`, `<span class="warn">`, etc.)** — do NOT
   tag the parent. The editor replaces *everything* between the tagged element's
   start and end tag, so tagging a parent that contains `<em>` would flatten the
   emphasis. Instead, **split the parent's text into multiple plain spans, one
   per editable chunk**, and tag each chunk individually:
   ```html
   <!-- WRONG — editing this would destroy the <em> tags -->
   <p data-edit-id="blk_body">Combine <em>agents</em> with <em>insight tools</em>.</p>

   <!-- RIGHT — every chunk is a separate, independently editable block -->
   <p>
     <span data-edit-id="blk_body_1">Combine </span>
     <em data-edit-id="blk_body_em1">agents</em>
     <span data-edit-id="blk_body_2"> with </span>
     <em data-edit-id="blk_body_em2">insight tools</em>
     <span data-edit-id="blk_body_3">.</span>
   </p>
   ```

3. **Text with `<br/>` line breaks** — wrap each line in its own span and keep
   the `<br/>` between them:
   ```html
   <div class="caption">
     <span data-edit-id="blk_cap_a">You can.</span><br/>
     <span data-edit-id="blk_cap_b">It will answer.</span>
   </div>
   ```

4. **Images** — tag the `<img>` directly. Both `src` and `alt` become editable.
   ```html
   <img src="logo.svg" alt="Brand" data-edit-id="blk_brand" />
   ```

5. **Audio** — for hyperframes-style timed audio, tag each `<audio>` element.
   `data-start`, `data-duration`, and `data-volume` become editable.
   ```html
   <audio id="narration" src="narration.wav"
          data-start="0" data-duration="38.1" data-volume="1"
          data-edit-id="blk_narration"></audio>
   ```

## `data-edit-id` naming

- Format: `blk_<snake_case>`. Stable across regenerations of the same artefact.
- Use scene/section prefixes for clarity (`blk_s1_l1`, `blk_hero_title`,
  `blk_cta_button`). Don't number arbitrarily.
- IDs must be globally unique within the artefact.

## `manifest.json` structure

```jsonc
{
  "version": 1,
  "artefact": "hyperframes",        // or "html-app" for static pages
  "entry": "index.html",
  "name": "Why Platinum, not raw AI? (video)",
  "blocks": [
    {
      "id": "blk_hero_title",       // EXACT match to data-edit-id in source
      "kind": "text",               // text | image | audio | timing | color
      "label": "Hero headline",     // human-readable, shown in editor sidebar
      "source": {
        "file": "index.html",
        "selector": "[data-edit-id=blk_hero_title]"
      },
      "properties": [
        { "key": "text", "type": "string" }
      ]
    },
    {
      "id": "blk_brand",
      "kind": "image",
      "label": "Brand logo",
      "source": { "file": "index.html", "selector": "[data-edit-id=blk_brand]" },
      "properties": [
        { "key": "src", "type": "string" },
        { "key": "alt", "type": "string" }
      ]
    },
    {
      "id": "blk_narration",
      "kind": "audio",
      "label": "Narration",
      "source": { "file": "index.html", "selector": "#narration" },
      "properties": [
        { "key": "data-start",    "type": "number", "min": 0, "step": 0.1 },
        { "key": "data-duration", "type": "number", "min": 0, "step": 0.1 },
        { "key": "data-volume",   "type": "number", "min": 0, "max": 1, "step": 0.05 }
      ]
    },
    {
      "id": "blk_t1",
      "kind": "timing",
      "label": "T1 — S1 hook out",
      "source": { "file": "index.html", "astVar": "T1" },
      "properties": [
        { "key": "value", "type": "number", "min": 0, "step": 0.1 }
      ]
    }
  ]
}
```

### Source pointer kinds

- `selector` — CSS attribute selector against an element with a `data-edit-id`.
  Use for text, images, and audio elements.
- `astVar` — name of a top-level numeric `const`/`let`/`var` in a `<script>`
  block. Use for timing constants (e.g. `const T1 = 4.0;` becomes editable).
- `cssVar` — name of a CSS custom property in a `:root` block. Use for theme
  tokens (`--brand: #2DD4BF;`).

### Block kinds and their property keys

| `kind`   | What it is                                | Required `properties[].key` |
|----------|-------------------------------------------|------------------------------|
| `text`   | Editable text content                     | `text`                       |
| `image`  | `<img>` tag                               | `src`, `alt`                 |
| `audio`  | `<audio>` with timeline metadata          | `data-start`, `data-duration`, `data-volume` |
| `timing` | Numeric AST constant (timeline cue point) | `value`                      |
| `color`  | CSS custom property                       | `value`                      |

## Coverage checklist (run mentally before emitting)

For every visible/audible thing in the artefact, confirm it's reachable:

- [ ] Every heading, paragraph, caption, button label has a `data-edit-id`
- [ ] Every emphasized inline run (`<em>`, `<strong>`, themed `<span>`) has its
      own `data-edit-id` AND its surrounding plain text is split into tagged spans
- [ ] Every `<img>` has a `data-edit-id`
- [ ] Every `<audio>` has a `data-edit-id` (or a stable `id` referenced from the
      manifest selector)
- [ ] Every timing constant in scripts (`T1`, `T2`, …) has an `astVar` block
- [ ] Every theme color in CSS that the user might want to change is a `:root`
      custom property, with a `cssVar` block
- [ ] Every block in `manifest.json` resolves to exactly one element in the source
- [ ] No two blocks share the same `id`

If anything visible is missing from the manifest, the user has to come back and
ask you to regenerate. That's the failure mode. Be exhaustive.
