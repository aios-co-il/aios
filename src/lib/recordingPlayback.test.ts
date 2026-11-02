import { expect, test } from "vitest";
import {
  isRecallRecordingUrl,
  presignedUrlStillValid,
  recordingNeedsRecallRefresh,
} from "./recordingPlayback.ts";

const recallUrl =
  "https://eu-central-1-recallai-production-bot.s3.amazonaws.com/_workspace/recordings/clip.mp4?X-Amz-Date=20261007T091841Z&X-Amz-Expires=21600";

test("isRecallRecordingUrl matches Recall's S3 host", () => {
  expect(isRecallRecordingUrl(recallUrl)).toBe(true);
  expect(isRecallRecordingUrl("https://zoom.us/rec/download/abc")).toBe(false);
  expect(isRecallRecordingUrl(null)).toBe(false);
});

test("recordingNeedsRecallRefresh skips files already in Storage", () => {
  expect(
    recordingNeedsRecallRefresh({
      source: "meeting_bot",
      file_path: "t/a.mp4",
      recording_url: recallUrl,
    }),
  ).toBe(false);
  expect(
    recordingNeedsRecallRefresh({
      source: "meeting_bot",
      file_path: null,
      recording_url: null,
    }),
  ).toBe(true);
  expect(
    recordingNeedsRecallRefresh({
      source: "zoom",
      file_path: null,
      recording_url: recallUrl,
    }),
  ).toBe(true);
  expect(
    recordingNeedsRecallRefresh({
      source: "zoom",
      file_path: null,
      recording_url: "https://zoom.us/rec/play/abc",
    }),
  ).toBe(false);
});

test("presignedUrlStillValid matches the Recall expiry window", () => {
  const during = Date.parse("2026-10-07T12:00:00Z");
  const after = Date.parse("2026-10-11T12:23:29Z");
  expect(presignedUrlStillValid(recallUrl, during)).toBe(true);
  expect(presignedUrlStillValid(recallUrl, after)).toBe(false);
  expect(presignedUrlStillValid("https://zoom.us/rec/play/abc", during)).toBe(
    false,
  );
});
