import { relative, isAbsolute } from "node:path";

export function isInside(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
