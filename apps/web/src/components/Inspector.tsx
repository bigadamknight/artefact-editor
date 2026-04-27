import type { Block, PropertyDescriptor } from "@artefact-editor/core";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Label } from "./ui/label.js";
import { AssetPicker } from "./AssetPicker.js";

interface InspectorProps {
  block: Block | null;
  values: Record<string, string | number>;
  onChange: (key: string, value: string | number) => void;
}

export function Inspector({ block, values, onChange }: InspectorProps) {
  if (!block) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Click anything in the preview to start editing.
      </div>
    );
  }

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
        {block.descriptors.map((desc) => (
          <DescriptorField
            key={desc.key}
            descriptor={desc}
            value={values[desc.key] ?? ""}
            onChange={(v) => onChange(desc.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

interface DescriptorFieldProps {
  descriptor: PropertyDescriptor;
  value: string | number;
  onChange: (value: string | number) => void;
}

function DescriptorField({ descriptor, value, onChange }: DescriptorFieldProps) {
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
        <AssetPicker current={String(value)} onPick={onChange} />
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
