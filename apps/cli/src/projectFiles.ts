import { readFile, writeFile, readdir, stat, rename, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ProjectFiles } from "@artefact-editor/core";

export class FsProjectFiles implements ProjectFiles {
  constructor(private readonly root: string) {}

  private resolve(file: string): string {
    const abs = resolve(this.root, file);
    if (!abs.startsWith(resolve(this.root))) {
      throw new Error(`Path escapes project root: ${file}`);
    }
    return abs;
  }

  async read(file: string): Promise<string> {
    return readFile(this.resolve(file), "utf8");
  }

  async readBinary(file: string): Promise<Uint8Array> {
    return readFile(this.resolve(file));
  }

  async write(file: string, contents: string): Promise<void> {
    const abs = this.resolve(file);
    await mkdir(dirname(abs), { recursive: true });
    const tmp = abs + ".tmp";
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, abs);
  }

  async list(dir: string): Promise<string[]> {
    try {
      return await readdir(this.resolve(dir));
    } catch {
      return [];
    }
  }

  async exists(file: string): Promise<boolean> {
    try {
      await stat(this.resolve(file));
      return true;
    } catch {
      return false;
    }
  }

  rootPath(): string {
    return resolve(this.root);
  }

  abs(file: string): string {
    return this.resolve(file);
  }
}

export function joinPath(...parts: string[]): string {
  return join(...parts);
}
