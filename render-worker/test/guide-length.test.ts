import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GUIDE_MAX_SECONDS,
  assertGuideLength,
} from "../src/jobs/guide-length.ts";
import { recordingSeconds } from "../src/jobs/recording-length.ts";

vi.mock("../src/jobs/recording-length.ts", () => ({
  recordingSeconds: vi.fn(),
}));

afterEach(() => vi.mocked(recordingSeconds).mockReset());

const RECORDING = new Uint8Array([1, 2, 3]);

describe("assertGuideLength", () => {
  test("measures up to just past the longest recording", async () => {
    vi.mocked(recordingSeconds).mockResolvedValue(60);
    await assertGuideLength(RECORDING);
    expect(recordingSeconds).toHaveBeenCalledWith(RECORDING, GUIDE_MAX_SECONDS);
  });

  test("a recording the recorder stopped a moment late still passes", async () => {
    vi.mocked(recordingSeconds).mockResolvedValue(GUIDE_MAX_SECONDS + 0.9);
    await assertGuideLength(RECORDING);
  });

  test("a longer recording, one with no audio, or an unreadable file is final", async () => {
    vi.mocked(recordingSeconds).mockResolvedValue(GUIDE_MAX_SECONDS + 2);
    await expect(assertGuideLength(RECORDING)).rejects.toMatchObject({
      final: true,
      message: expect.stringContaining("ארוכה"),
    });
    vi.mocked(recordingSeconds).mockResolvedValue(null);
    await expect(assertGuideLength(RECORDING)).rejects.toMatchObject({
      final: true,
    });
    vi.mocked(recordingSeconds).mockRejectedValue(new Error("ffmpeg exited 1"));
    await expect(assertGuideLength(RECORDING)).rejects.toMatchObject({
      final: true,
      message: expect.stringContaining("ffmpeg exited 1"),
    });
  });

  test("the longest recording is the board's", () => {
    const guide = readFileSync(
      new URL(
        "../../supabase/functions/_shared/workshop/narration-guide.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(
      Number(/export const GUIDE_MAX_SECONDS = (\d+);/.exec(guide)?.[1]),
    ).toBe(GUIDE_MAX_SECONDS);
  });
});
