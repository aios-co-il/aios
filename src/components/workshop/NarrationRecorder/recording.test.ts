import { describe, expect, test } from "vitest";
import type { StoryboardScene } from "../storyboardScenes";
import {
  clockOf,
  narrationScript,
  pickRecordingType,
  recordingFile,
} from "./recording";

describe("pickRecordingType", () => {
  test("Chrome records Opus in WebM, Safari AAC in MP4", () => {
    expect(pickRecordingType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingType((type) => type === "audio/mp4")).toBe("audio/mp4");
  });

  test("a browser that names none lets the recorder choose", () => {
    expect(pickRecordingType(() => false)).toBeUndefined();
  });
});

describe("recordingFile", () => {
  test("stores the base type the bucket accepts, with the worker's extension", () => {
    expect(recordingFile("audio/webm;codecs=opus")).toStrictEqual({
      contentType: "audio/webm",
      extension: "webm",
    });
    expect(recordingFile("audio/mp4")).toStrictEqual({
      contentType: "audio/mp4",
      extension: "mp4",
    });
    expect(recordingFile("audio/ogg; codecs=opus").extension).toBe("ogg");
    expect(recordingFile("")).toStrictEqual({
      contentType: "audio/webm",
      extension: "webm",
    });
  });
});

describe("narrationScript", () => {
  const scene = (voiceover: string, lipsync = false) =>
    ({ voiceover, lipsync }) as StoryboardScene;

  test("reads the narrated lines in order, without talking scenes", () => {
    expect(
      narrationScript([
        scene("קופי, מדיה."),
        scene("שלום לכם", true),
        scene("  "),
        scene("כרמן מנהלת את הכול."),
      ]),
    ).toBe("קופי, מדיה.\nכרמן מנהלת את הכול.");
  });
});

describe("clockOf", () => {
  test("shows minutes and seconds", () => {
    expect(clockOf(7.8)).toBe("0:07");
    expect(clockOf(65)).toBe("1:05");
  });
});
