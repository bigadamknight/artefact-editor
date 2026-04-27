/**
 * Read/write top-level `const|let|var <name> = <numeric-literal>` declarations
 * inside any <script> block in an HTML file. Sufficient for hyperframes-style
 * scene-time tables which all three Platinum videos use.
 *
 * Scope: numeric literals only (positive/negative, decimals). String/object
 * literals or expressions are rejected — they would need full AST parsing
 * (deferred to a future adapter that imports recast/babel).
 */

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declarationRegex(varName: string): RegExp {
  return new RegExp(
    `\\b(const|let|var)\\s+${escapeRegex(varName)}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)(?=\\s*[;,\\n])`,
  );
}

export function findScriptVar(html: string, varName: string): string {
  const re = declarationRegex(varName);
  const m = re.exec(html);
  if (!m) {
    throw new Error(
      `Script variable not found or not a numeric literal: ${varName}`,
    );
  }
  return m[2]!;
}

export interface ScriptVarLocation {
  start: number;
  end: number;
}

export function locateScriptVarValue(
  html: string,
  varName: string,
): ScriptVarLocation {
  const re = declarationRegex(varName);
  const m = re.exec(html);
  if (!m) {
    throw new Error(
      `Script variable not found or not a numeric literal: ${varName}`,
    );
  }
  const valueStart = m.index + m[0].length - m[2]!.length;
  const valueEnd = valueStart + m[2]!.length;
  return { start: valueStart, end: valueEnd };
}
