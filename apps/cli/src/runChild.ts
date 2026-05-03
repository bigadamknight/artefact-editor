import { spawn, type SpawnOptions } from "node:child_process";

export interface ChildResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a child process and collect stdout/stderr to strings. Resolves on
 * `close`; rejects only on a spawn `error` event (so callers handle non-zero
 * exits via `result.code`).
 */
export function runChild(
  cmd: string,
  args: string[],
  opts: SpawnOptions = {},
): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}
