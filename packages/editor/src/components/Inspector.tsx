import type { Block, PropertyDescriptor } from "@artefact-editor/core";
import { Label } from "./ui/label.js";
import { AssetPicker } from "./AssetPicker.js";
import { FieldRow } from "./FieldRow.js";

interface InspectorProps {
  projectId: string;
  block: Block | null;
  values: Record<string, string | number>;
  styles?: Record<string, string>;
  assets: string[];
  onChange: (key: string, value: string | number) => void;
}

type StyleKey =
  | "color"
  | "font-size"
  | "font-weight"
  | "font-family"
  | "text-align"
  | "letter-spacing"
  | "line-height"
  | "top"
  | "left"
  | "right"
  | "bottom"
  | "z-index"
  | "width"
  | "height"
  | "margin-top"
  | "margin-right"
  | "margin-bottom"
  | "margin-left"
  | "padding-top"
  | "padding-right"
  | "padding-bottom"
  | "padding-left"
  | "transform"
  | "opacity";

type StyleField = { key: StyleKey; label: string; type: "color" | "text" };
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

export function Inspector({ projectId, block, values, styles, assets, onChange }: InspectorProps) {
  if (!block) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Click anything in the preview to start editing.
      </div>
    );
  }

  const showStyles = (block.kind === "text" || block.kind === "image") && styles;
  const visibleGroups = block.kind === "image"
    ? STYLE_GROUPS.filter((g) => g.title !== "Typography")
    : STYLE_GROUPS;
  const defaultOpenGroup = block.kind === "image" ? "Position" : "Typography";

  // Image content is owned by the agent — surface position/spacing instead of
  // an asset picker so a comment can drive the swap.
  const visibleDescriptors = block.descriptors.filter((desc) => {
    if (desc.key.startsWith("style.")) return false;
    if (block.kind === "image" && desc.type === "asset") return false;
    return true;
  });

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
        {visibleDescriptors.map((desc) => (
          <DescriptorField
            key={desc.key}
            projectId={projectId}
            descriptor={desc}
            value={values[desc.key] ?? ""}
            assets={assets}
            onChange={(v) => onChange(desc.key, v)}
          />
        ))}
      </div>

      {showStyles
        ? visibleGroups.map((group) => (
            <details
              key={group.title}
              open={group.title === defaultOpenGroup}
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
                    <FieldRow
                      key={f.key}
                      kind={f.type}
                      htmlId={overrideKey}
                      label={f.label}
                      value={current}
                      onChange={(v) => onChange(overrideKey, v)}
                    />
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
  assets: string[];
  onChange: (value: string | number) => void;
}

function DescriptorField({ projectId, descriptor, value, assets, onChange }: DescriptorFieldProps) {
  if (descriptor.type === "asset") {
    return (
      <div className="space-y-1.5">
        <Label>{descriptor.key}</Label>
        <AssetPicker projectId={projectId} assets={assets} current={String(value)} onPick={onChange} />
      </div>
    );
  }

  if (descriptor.type === "string") {
    return (
      <FieldRow
        kind={descriptor.multiline ? "textarea" : "text"}
        htmlId={descriptor.key}
        label={descriptor.key}
        value={String(value)}
        onChange={onChange}
      />
    );
  }

  if (descriptor.type === "color") {
    return (
      <FieldRow
        kind="color"
        htmlId={descriptor.key}
        label={descriptor.key}
        value={String(value).trim() || "#000000"}
        onChange={onChange}
      />
    );
  }

  if (descriptor.type === "number") {
    return (
      <FieldRow
        kind="number"
        htmlId={descriptor.key}
        label={descriptor.key}
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
      />
    );
  }

  if (descriptor.type === "enum") {
    return (
      <FieldRow
        kind="enum"
        htmlId={descriptor.key}
        label={descriptor.key}
        value={String(value)}
        onChange={onChange}
        options={descriptor.options}
      />
    );
  }

  return null;
}
