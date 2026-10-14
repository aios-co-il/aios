import assert from "node:assert/strict";
import test from "node:test";
import {
  isRecallRecordingUrl,
  presignedUrlStillValid,
  recordingNeedsRecallRefresh,
} from "./recordingPlayback.ts";

const recallUrl =
  "https://eu-central-1-recallai-production-bot.s3.amazonaws.com/_workspace/recordings/clip.mp4?X-Amz-Date=20261007T091841Z&X-Amz-Expires=21600";

test("isRecallRecordingUrl matches Recall's S3 host", () => {
  assert.equal(isRecallRecordingUrl(recallUrl), true);
  assert.equal(isRecallRecordingUrl("https://zoom.us/rec/download/abc"), false);
  assert.equal(isRecallRecordingUrl(null), false);
});

test("recordingNeedsRecallRefresh skips files already in Storage", () => {
  assert.equal(
    recordingNeedsRecallRefresh({
      source: "meeting_bot",
      file_path: "t/a.mp4",
      recording_url: recallUrl,
    }),
    false,
  );
  assert.equal(
    recordingNeedsRecallRefresh({
      source: "meeting_bot",
      file_path: null,
      recording_url: null,
    }),
    true,
  );
  assert.equal(
    recordingNeedsRecallRefresh({
      source: "zoom",
      file_path: null,
      recording_url: recallUrl,
    }),
    true,
  );
  assert.equal(
    recordingNeedsRecallRefresh({
      source: "zoom",
      file_path: null,
      recording_url: "https://zoom.us/rec/play/abc",
    }),
    false,
  );
});

test("presignedUrlStillValid matches the Recall expiry window", () => {
  const during = Date.parse("2026-10-07T12:00:00Z");
  const after = Date.parse("2026-10-11T12:23:29Z");
  assert.equal(presignedUrlStillValid(recallUrl, during), true);
  assert.equal(presignedUrlStillValid(recallUrl, after), false);
  assert.equal(
    presignedUrlStillValid("https://zoom.us/rec/play/abc", during),
    false,
  );
});
