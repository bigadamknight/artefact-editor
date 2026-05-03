export type PropertyDescriptor =
  | { key: string; type: "string"; multiline?: boolean; canonical?: boolean }
  | { key: string; type: "asset"; mime?: string[]; canonical?: boolean }
  | { key: string; type: "color"; canonical?: boolean }
  | { key: string; type: "number"; min?: number; max?: number; step?: number; canonical?: boolean }
  | { key: string; type: "enum"; options: string[]; canonical?: boolean };

export type PropertyValue = string | number;
