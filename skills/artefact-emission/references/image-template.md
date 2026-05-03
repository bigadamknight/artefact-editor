# image-template artefacts

PIL templates rendering OG cards, social posts, banners, and other marketing
graphics. The "source of truth" is `spec.json` — a JSON file the template
reads. The editor edits `spec.json` and re-runs the Python template on save.

## Manifest

```json
{
  "version": 1,
  "artefact": "image-template",
  "entry": "output.png",
  "specFile": "spec.json",
  "templateModule": "og_image",
  "name": "OG card",
  "blocks": [...]
}
```

- `entry` — path to the rendered PNG (relative to the project root).
- `specFile` — JSON file the template reads. Defaults to `spec.json` if
  omitted.
- `templateModule` — Python module name (without `.py`) the editor calls.
  Resolves against `~/.claude/skills/image-template/templates/`.

## Source pointers (specKey)

Every block uses a `specKey` source pointer naming a top-level field in
`spec.json`:

```json
{
  "id": "blk_title",
  "kind": "text",
  "label": "Title",
  "source": { "file": "spec.json", "specKey": "title" },
  "properties": [{ "key": "value", "type": "string", "multiline": true }]
}
```

## Click-to-select via region sidecar

If the PIL template calls `self.track("title", x, y, w, h)` during
`_draw_content`, it emits a `<output>.layout.json` sidecar at save time. The
editor uses it to overlay invisible click-zones on the rendered PNG, giving
image-template artefacts the same direct-selection feel iframe artefacts get
from the preview bridge.

The sidecar shape:

```json
{
  "regions": [
    { "key": "title", "x": 60, "y": 320, "w": 1080, "h": 96 }
  ]
}
```

The editor maps `key` to the block whose `source.specKey` matches, so the
naming has to line up between the template's `track()` call and the
manifest's `specKey`.

## Render flow

User edits a field → editor writes the new value into `spec.json` → preview
becomes visually stale (banner: "Preview is out of date — click Render to
update") → user clicks Render → editor spawns `python3 -c "from
templateModule import Template; ..."` → PNG is regenerated → editor reloads
the preview.
