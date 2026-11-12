import { describe, expect, it } from "vitest";
import {
  chooseFrameTime,
  createSerialQueue,
  frameSize,
  meetingFramePath,
  needsMeetingFrame,
  type FrameCandidate,
} from "./meetingFrame";

const videoRecording: FrameCandidate = {
  thumbnail_path: null,
  file_path: "tenant-1/1700000000.mp4",
  recording_type: "shared_screen_with_speaker_view",
};

describe("needsMeetingFrame", () => {
  it("accepts a stored video without a thumbnail", () => {
    expect(needsMeetingFrame(videoRecording)).toBe(true);
  });

  it("accepts a WebM file whatever its recording type", () => {
    expect(
      needsMeetingFrame({
        ...videoRecording,
        file_path: "tenant-1/meeting.webm",
        recording_type: "audio_only",
      }),
    ).toBe(true);
  });

  it("accepts an unknown extension when the type is not audio", () => {
    expect(
      needsMeetingFrame({
        ...videoRecording,
        file_path: "tenant-1/meeting",
        recording_type: null,
      }),
    ).toBe(true);
  });

  it("skips a recording that already has a thumbnail", () => {
    expect(
      needsMeetingFrame({
        ...videoRecording,
        thumbnail_path: "tenant-1/thumbnails/a.jpg",
      }),
    ).toBe(false);
  });

  it("skips a recording that exists only at a Recall URL", () => {
    expect(needsMeetingFrame({ ...videoRecording, file_path: null })).toBe(
      false,
    );
  });

  it("skips audio-only recordings", () => {
    expect(
      needsMeetingFrame({
        ...videoRecording,
        file_path: "tenant-1/meeting",
        recording_type: "audio_only",
      }),
    ).toBe(false);
  });

  it("skips audio files with no recording type", () => {
    expect(
      needsMeetingFrame({
        ...videoRecording,
        file_path: "tenant-1/meeting.m4a",
        recording_type: null,
      }),
    ).toBe(false);
  });
});

describe("chooseFrameTime", () => {
  it("seeks 40% into a typical meeting", () => {
    expect(chooseFrameTime(1000)).toBe(400);
  });

  it("caps the seek at ten minutes for long meetings", () => {
    expect(chooseFrameTime(3 * 60 * 60)).toBe(600);
  });

  it("seeks at least five seconds in", () => {
    expect(chooseFrameTime(10)).toBe(5);
  });

  it("stays inside a video shorter than five seconds", () => {
    expect(chooseFrameTime(4)).toBe(3.8);
  });

  it("uses a short fixed offset when the duration is unknown", () => {
    expect(chooseFrameTime(Infinity)).toBe(5);
    expect(chooseFrameTime(Number.NaN)).toBe(5);
  });
});

describe("meetingFramePath", () => {
  it("stores frames under the tenant's thumbnails folder", () => {
    expect(meetingFramePath("tenant-1", "rec-1")).toBe(
      "tenant-1/thumbnails/rec-1.jpg",
    );
  });
});

describe("frameSize", () => {
  it("scales wide video down to 640px, keeping the aspect", () => {
    expect(frameSize(1920, 1080)).toEqual({ width: 640, height: 360 });
  });

  it("keeps a small video at its own size", () => {
    expect(frameSize(480, 270)).toEqual({ width: 480, height: 270 });
  });
});

describe("createSerialQueue", () => {
  it("starts a task only after the previous one settles", async () => {
    const enqueue = createSerialQueue();
    const events: Array<string> = [];
    let finishFirst: (() => void) | undefined;
    const first = enqueue(
      () =>
        new Promise<void>((resolve) => {
          events.push("first:start");
          finishFirst = () => {
            events.push("first:end");
            resolve();
          };
        }),
    );
    const second = enqueue(async () => {
      events.push("second:start");
    });
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    finishFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("keeps running after a task fails", async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(() => Promise.reject(new Error("boom")));
    const next = enqueue(async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
