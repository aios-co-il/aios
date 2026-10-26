import assert from "node:assert/strict";
import test from "node:test";
import { extractRecallDownloads } from "./recall.ts";

test("extractRecallDownloads reads media shortcuts and duration", () => {
  const out = extractRecallDownloads({
    recordings: [
      {
        started_at: "2026-01-01T10:00:00Z",
        completed_at: "2026-01-01T10:30:00Z",
        media_shortcuts: {
          video_mixed: { data: { download_url: "https://v" } },
          audio_mixed: { data: { download_url: "https://a" } },
          transcript: {
            data: { download_url: "https://t" },
            status: { code: "done" },
          },
        },
      },
    ],
  });
  assert.deepEqual(out, {
    videoUrl: "https://v",
    audioUrl: "https://a",
    transcriptUrl: "https://t",
    transcriptStatus: "done",
    durationSeconds: 1800,
  });
});

test("extractRecallDownloads returns nulls for a bot without recordings", () => {
  const empty = {
    videoUrl: null,
    audioUrl: null,
    transcriptUrl: null,
    transcriptStatus: null,
    durationSeconds: null,
  };
  assert.deepEqual(extractRecallDownloads({}), empty);
  assert.deepEqual(extractRecallDownloads({ recordings: "x" }), empty);
});

test("extractRecallDownloads drops non-string urls", () => {
  const out = extractRecallDownloads({
    recordings: [
      { media_shortcuts: { video_mixed: { data: { download_url: 5 } } } },
    ],
  });
  assert.equal(out.videoUrl, null);
  assert.equal(out.durationSeconds, null);
});
