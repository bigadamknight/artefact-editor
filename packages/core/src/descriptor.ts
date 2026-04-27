export type PropertyDescriptor =
  | { key: string; type: "string"; multiline?: boolean }
  | { key: string; type: "asset"; mime?: string[] }
  | { key: string; type: "color" }
  | { key: string; type: "number"; min?: number; max?: number; step?: number }
  | { key: string; type: "enum"; options: string[] };

export type PropertyValue = string | number;
