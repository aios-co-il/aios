import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  lastProgressSeconds,
  recordingSeconds,
} from "../src/jobs/recording-length.ts";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** A tone of `seconds` as WAV bytes. */
function tone(seconds: number) {
  const dir = mkdtempSync(join(tmpdir(), "tone-"));
  try {
    const file = join(dir, "tone.wav");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=duration=${seconds}:sample_rate=8000`,
      file,
    ]);
    return new Uint8Array(readFileSync(file));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("recordingSeconds", () => {
  test("reads ffmpeg's last progress time", () => {
    expect(
      lastProgressSeconds(
        "size=0kB time=00:00:00.00 bitrate=N/A\rsize=N/A time=00:03:01.50 bitrate=N/A",
      ),
    ).toBe(181.5);
    expect(lastProgressSeconds("Invalid data found")).toBeNull();
  });

  test.skipIf(!hasFfmpeg)("measures a recording by decoding it", async () => {
    expect(await recordingSeconds(tone(3), 180)).toBeCloseTo(3, 0);
  });

  test.skipIf(!hasFfmpeg)(
    "a file far past the cap decodes only past it",
    async () => {
      const seconds = await recordingSeconds(tone(400), 180);
      expect(seconds).toBeGreaterThan(181);
      expect(seconds).toBeLessThanOrEqual(182.1);
    },
  );

  test.skipIf(!hasFfmpeg)("a file that is not audio throws", async () => {
    await expect(
      recordingSeconds(new TextEncoder().encode("not audio"), 180),
    ).rejects.toThrow();
  });
});
