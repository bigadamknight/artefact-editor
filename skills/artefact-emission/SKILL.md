---
name: artefact-emission
title: Emit editable artefacts (artefact-editor)
description: When generating HTML/JS/CSS web apps, hyperframes videos, or PIL marketing graphics, also emit a manifest.json that tags every visible piece of content as an editable block. Lets users open the result in artefact-editor and direct-edit text, images, colours, and timing without round-tripping to the agent.
license: MIT
metadata:
  author: artefact-editor
  version: "1.0"
---

# Emit editable artefacts

Always-on rule. When you produce an artefact, also produce a `manifest.json`
listing every editable block. No need to ask — emit one every time.

## Directory you produce

```
<project>/
├── index.html          # or whatever entry the artefact needs
├── manifest.json       # the editor's index of editable blocks
├── spec.json           # only for image-template artefacts
└── assets/             # images, fonts, audio referenced from the entry
```

## Pick the artefact kind

| `manifest.artefact` | When to use                                                     | Reference                                  |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `html-app`          | Static or built HTML/CSS/JS web pages                           | [references/html-app.md](references/html-app.md)             |
| `hyperframes`       | HTML compositions with a GSAP timeline (videos, animations)     | [references/hyperframes.md](references/hyperframes.md)       |
| `image-template`    | PIL templates rendering OG cards, social posts, banners         | [references/image-template.md](references/image-template.md) |

All three kinds share the same `manifest.json` shape; only the source pointer
types and how the editor renders/saves differ.

## Tagging rule (HTML kinds)

Every text node, every `<img>`, every `<audio>`, and every piece of inline-formatted
text the user might want to change must be reachable from a `data-edit-id`
attribute. Be **exhaustive** — if it's visible on screen or audible, it gets a
marker. Missing markers mean dead-ends in the editor and are the #1 thing to avoid.

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
  "artefact": "hyperframes",        // or "html-app" or "image-template"
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
- `specKey` — JSON path inside `spec.json` (image-template only).

### Block kinds and their property keys

| `kind`   | What it is                                | Required `properties[].key`                  |
| -------- | ----------------------------------------- | -------------------------------------------- |
| `text`   | Editable text content                     | `text`                                       |
| `image`  | `<img>` tag                               | `src`, `alt`                                 |
| `audio`  | `<audio>` with timeline metadata          | `data-start`, `data-duration`, `data-volume` |
| `timing` | Numeric AST constant (timeline cue point) | `value`                                      |
| `color`  | CSS custom property                       | `value`                                      |

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

## Emitting for built / bundled apps

If the artefact is a built React/Vite app whose strings live in a JS bundle as
well as in `index.html` (the rehydration case), artefact-editor automatically
mirrors text edits into sibling `.js`/`.css` files alongside the HTML edit, so
hydration won't overwrite the user's change. You don't need to declare anything
extra in the manifest — just make sure `data-edit-id` is on the rendered
element in the built output.
