import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { sourceTime, videoClipThumbnail } from "./videoThumbnail";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ae-video-thumb-"));
  // A 2 s, 64x36 test clip.
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=64x36:rate=10",
    "-pix_fmt", "yuv420p", join(dir, "clip.mp4"),
  ]);
  writeFileSync(
    join(dir, "index.html"),
    `<div id="root" data-composition-id="main">
      <video id="shot" src="clip.mp4" data-start="3" data-duration="2" data-media-start="0.5" muted></video>
      <video id="escape" src="../outside.mp4" data-start="0" muted></video>
      <div id="title" data-start="0" data-duration="1">Title</div>
    </div>`,
  );
});

const request = (selector: string, seekTime = 3.5) => ({
  projectDir: dir,
  compPath: "index.html",
  selector,
  seekTime,
  outputWidth: 32,
  outputHeight: 18,
  signal: new AbortController().signal,
});

describe("sourceTime", () => {
  it("maps composition time into the clip's source range", () => {
    expect(sourceTime({ start: 3, mediaStart: 0.5, rate: 1 }, 4)).toBeCloseTo(1.5);
    expect(sourceTime({ start: 3, mediaStart: 0.5, rate: 2 }, 4)).toBeCloseTo(2.5);
  });

  it("never seeks before the clip's media start", () => {
    expect(sourceTime({ start: 3, mediaStart: 0.5, rate: 1 }, 1)).toBeCloseTo(0.5);
  });
});

describe("videoClipThumbnail", () => {
  it("returns a JPEG frame for a video clip", async () => {
    const buf = await videoClipThumbnail(request("#shot"));
    expect(buf).not.toBeNull();
    expect(buf!.subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  it("returns a PNG when asked", async () => {
    const buf = await videoClipThumbnail({ ...request("#shot"), format: "png" });
    expect(buf!.subarray(1, 4).toString()).toBe("PNG");
  });

  it("returns null for elements that are not video", async () => {
    expect(await videoClipThumbnail(request("#title"))).toBeNull();
    expect(await videoClipThumbnail(request(".shot"))).toBeNull();
    expect(await videoClipThumbnail(request("#missing"))).toBeNull();
  });

  it("refuses media outside the project directory", async () => {
    expect(await videoClipThumbnail(request("#escape"))).toBeNull();
  });
});
