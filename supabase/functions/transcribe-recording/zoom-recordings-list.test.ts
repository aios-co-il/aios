import assert from "node:assert/strict";
import test from "node:test";
import { freshZoomRecordingUrls } from "./zoom-recordings-list.ts";

const listData = {
  meetings: [
    { id: 1, recording_files: [] },
    {
      id: 42,
      uuid: "u-42",
      recording_files: [
        { recording_type: "shared_screen", download_url: "https://z/v" },
        {
          recording_type: "audio_only",
          download_url: "https://z/a",
          play_url: "https://z/p",
        },
      ],
    },
  ],
};

test("freshZoomRecordingUrls puts the wanted recording type first, without duplicates", () => {
  assert.deepEqual(freshZoomRecordingUrls(listData, "42", "AUDIO_ONLY"), [
    "https://z/a",
    "https://z/p",
    "https://z/v",
  ]);
  assert.equal(freshZoomRecordingUrls(listData, "u-42", "")?.[0], "https://z/v");
});

test("freshZoomRecordingUrls returns null when the meeting is missing", () => {
  assert.equal(freshZoomRecordingUrls(listData, "7", "audio_only"), null);
  assert.equal(freshZoomRecordingUrls({}, "42", "audio_only"), null);
  assert.deepEqual(freshZoomRecordingUrls(listData, "1", "x"), []);
});
