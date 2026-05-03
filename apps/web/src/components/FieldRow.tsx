import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Label } from "./ui/label.js";

type Kind = "text" | "color" | "number" | "textarea" | "enum";

type Common = {
  htmlId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export type FieldRowProps =
  | (Common & { kind: "text" | "color" | "textarea" })
  | (Common & { kind: "number"; min?: number; max?: number; step?: number })
  | (Common & { kind: "enum"; options: readonly string[] });

export function FieldRow(props: FieldRowProps) {
  const { htmlId, label, value, onChange, kind } = props;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlId}>{label}</Label>
      {kind === "color" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6,8}$/.test(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
          />
          <Input id={htmlId} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      ) : kind === "textarea" ? (
        <Textarea id={htmlId} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : kind === "number" ? (
        <Input
          id={htmlId}
          type="number"
          min={props.min}
          max={props.max}
          step={props.step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : kind === "enum" ? (
        <select
          id={htmlId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          {props.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <Input id={htmlId} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
