import type { Block, PropertyDescriptor } from "@artefact-editor/core";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Label } from "./ui/label.js";
import { AssetPicker } from "./AssetPicker.js";

interface InspectorProps {
  projectId: string;
  block: Block | null;
  values: Record<string, string | number>;
  styles?: Record<string, string>;
  onChange: (key: string, value: string | number) => void;
}

type StyleField = { key: string; label: string; type: "color" | "text" };
type StyleGroup = { title: string; fields: StyleField[] };

const STYLE_GROUPS: StyleGroup[] = [
  {
    title: "Typography",
    fields: [
      { key: "color", label: "Color", type: "color" },
      { key: "font-size", label: "Font size", type: "text" },
      { key: "font-weight", label: "Font weight", type: "text" },
      { key: "font-family", label: "Font family", type: "text" },
      { key: "text-align", label: "Text align", type: "text" },
      { key: "letter-spacing", label: "Letter spacing", type: "text" },
      { key: "line-height", label: "Line height", type: "text" },
    ],
  },
  {
    title: "Position",
    fields: [
      { key: "top", label: "Top", type: "text" },
      { key: "left", label: "Left", type: "text" },
      { key: "right", label: "Right", type: "text" },
      { key: "bottom", label: "Bottom", type: "text" },
      { key: "z-index", label: "Z-index", type: "text" },
    ],
  },
  {
    title: "Size",
    fields: [
      { key: "width", label: "Width", type: "text" },
      { key: "height", label: "Height", type: "text" },
    ],
  },
  {
    title: "Spacing",
    fields: [
      { key: "margin-top", label: "Margin top", type: "text" },
      { key: "margin-right", label: "Margin right", type: "text" },
      { key: "margin-bottom", label: "Margin bottom", type: "text" },
      { key: "margin-left", label: "Margin left", type: "text" },
      { key: "padding-top", label: "Padding top", type: "text" },
      { key: "padding-right", label: "Padding right", type: "text" },
      { key: "padding-bottom", label: "Padding bottom", type: "text" },
      { key: "padding-left", label: "Padding left", type: "text" },
    ],
  },
  {
    title: "Transform & effects",
    fields: [
      { key: "transform", label: "Transform", type: "text" },
      { key: "opacity", label: "Opacity", type: "text" },
    ],
  },
];

function rgbToHex(rgb: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgb);
  if (!m) return rgb;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + hex(+m[1]!) + hex(+m[2]!) + hex(+m[3]!);
}

export function Inspector({ projectId, block, values, styles, onChange }: InspectorProps) {
  if (!block) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Click anything in the preview to start editing.
      </div>
    );
  }

  const showStyles = block.kind === "text" && styles;

  return (
    <div className="space-y-5 p-4">
      <header>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {block.kind}
        </div>
        <div className="text-sm font-semibold">{block.label}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{block.id}</div>
      </header>

      <div className="space-y-4">
        {block.descriptors
          .filter((desc) => !desc.key.startsWith("style."))
          .map((desc) => (
            <DescriptorField
              key={desc.key}
              projectId={projectId}
              descriptor={desc}
              value={values[desc.key] ?? ""}
              onChange={(v) => onChange(desc.key, v)}
            />
          ))}
      </div>

      {showStyles
        ? STYLE_GROUPS.map((group) => (
            <details
              key={group.title}
              open={group.title === "Typography"}
              className="space-y-3 border-t border-border pt-4"
            >
              <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </summary>
              <div className="space-y-3 pt-2">
                {group.fields.map((f) => {
                  const overrideKey = `style.${f.key}`;
                  const pending = values[overrideKey];
                  const liveRaw = styles![f.key] ?? "";
                  const live = f.type === "color" ? rgbToHex(liveRaw) : liveRaw;
                  const current = pending !== undefined ? String(pending) : live;
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={overrideKey}>{f.label}</Label>
                      {f.type === "color" ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6,8}$/.test(current) ? current : "#000000"}
                            onChange={(e) => onChange(overrideKey, e.target.value)}
                            className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                          />
                          <Input
                            id={overrideKey}
                            value={current}
                            onChange={(e) => onChange(overrideKey, e.target.value)}
                          />
                        </div>
                      ) : (
                        <Input
                          id={overrideKey}
                          value={current}
                          onChange={(e) => onChange(overrideKey, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))
        : null}
    </div>
  );
}

interface DescriptorFieldProps {
  projectId: string;
  descriptor: PropertyDescriptor;
  value: string | number;
  onChange: (value: string | number) => void;
}

function DescriptorField({ projectId, descriptor, value, onChange }: DescriptorFieldProps) {
  if (descriptor.type === "string") {
    if (descriptor.multiline) {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={descriptor.key}>{descriptor.key}</Label>
          <Textarea
            id={descriptor.key}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label htmlFor={descriptor.key}>{descriptor.key}</Label>
        <Input
          id={descriptor.key}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (descriptor.type === "color") {
    const colorVal = String(value).trim() || "#000000";
    const isHex = /^#[0-9a-fA-F]{3,8}$/.test(colorVal);
    return (
      <div className="space-y-1.5">
        <Label htmlFor={descriptor.key}>{descriptor.key}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isHex ? colorVal : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
          />
          <Input
            id={descriptor.key}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (descriptor.type === "asset") {
    return (
      <div className="space-y-1.5">
        <Label>{descriptor.key}</Label>
        <AssetPicker projectId={projectId} current={String(value)} onPick={onChange} />
      </div>
    );
  }

  if (descriptor.type === "number") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={descriptor.key}>{descriptor.key}</Label>
        <Input
          id={descriptor.key}
          type="number"
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (descriptor.type === "enum") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={descriptor.key}>{descriptor.key}</Label>
        <select
          id={descriptor.key}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          {descriptor.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}
