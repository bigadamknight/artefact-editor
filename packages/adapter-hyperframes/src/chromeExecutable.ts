import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Browser,
  detectBrowserPlatform,
  getInstalledBrowsers,
  getVersionComparator,
} from "@puppeteer/browsers";

export interface ChromeExecutable {
  path: string;
  source: "env" | "hyperframes-cache" | "puppeteer-cache" | "system";
}

const SYSTEM_CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Newest chrome-headless-shell for this platform in a @puppeteer/browsers
 * cache directory, falling back to the newest full Chrome for Testing there.
 */
async function fromCache(cacheDir: string): Promise<string | null> {
  if (!existsSync(cacheDir)) return null;
  const platform = detectBrowserPlatform();
  let installed;
  try {
    installed = await getInstalledBrowsers({ cacheDir });
  } catch {
    return null;
  }
  for (const browser of [Browser.CHROMEHEADLESSSHELL, Browser.CHROME]) {
    const compare = getVersionComparator(browser);
    const newest = installed
      .filter((b) => b.browser === browser && b.platform === platform && existsSync(b.executablePath))
      .sort((a, b) => compare(b.buildId, a.buildId))[0];
    if (newest) return newest.executablePath;
  }
  return null;
}

function onPath(name: string): string | null {
  try {
    const found = execFileSync("which", [name], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return found && existsSync(found) ? found : null;
  } catch {
    return null;
  }
}

async function resolve(): Promise<ChromeExecutable | null> {
  for (const name of ["HYPERFRAMES_BROWSER_PATH", "PUPPETEER_EXECUTABLE_PATH"]) {
    const path = process.env[name];
    if (path && existsSync(path)) return { path, source: "env" };
  }
  const hyperframes = await fromCache(join(homedir(), ".cache", "hyperframes", "chrome"));
  if (hyperframes) return { path: hyperframes, source: "hyperframes-cache" };
  const puppeteer = await fromCache(join(homedir(), ".cache", "puppeteer"));
  if (puppeteer) return { path: puppeteer, source: "puppeteer-cache" };
  if (process.platform === "darwin" && existsSync(SYSTEM_CHROME_MAC)) {
    return { path: SYSTEM_CHROME_MAC, source: "system" };
  }
  for (const name of ["google-chrome", "chromium"]) {
    const path = onPath(name);
    if (path) return { path, source: "system" };
  }
  return null;
}

let resolved: Promise<ChromeExecutable | null> | null = null;

/**
 * The Chrome that frame capture launches, resolved once per process:
 * `HYPERFRAMES_BROWSER_PATH` / `PUPPETEER_EXECUTABLE_PATH`, then the
 * HyperFrames CLI's browser cache (`~/.cache/hyperframes/chrome`), then
 * puppeteer's (`~/.cache/puppeteer`), then a system Chrome. Null when none
 * exists; nothing is ever downloaded.
 */
export function resolveChromeExecutable(): Promise<ChromeExecutable | null> {
  resolved ??= resolve();
  return resolved;
}
