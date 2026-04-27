#!/usr/bin/env node
// Thin CLI shim that delegates to the compiled or tsx-loaded server entry.
// In dev we run via `tsx src/index.ts <project-dir>`; this is for installed use.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "..", "src", "index.ts");
const args = process.argv.slice(2);
const child = spawn(process.execPath, ["--import", "tsx/esm", entry, ...args], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
