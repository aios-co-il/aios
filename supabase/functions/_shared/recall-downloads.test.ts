import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { extractRecallDownloads } from "./recall.ts";

Deno.test("extractRecallDownloads reads media shortcuts and duration", () => {
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
  assertEquals(out, {
    videoUrl: "https://v",
    audioUrl: "https://a",
    transcriptUrl: "https://t",
    transcriptStatus: "done",
    durationSeconds: 1800,
  });
});

Deno.test(
  "extractRecallDownloads returns nulls for a bot without recordings",
  () => {
    const empty = {
      videoUrl: null,
      audioUrl: null,
      transcriptUrl: null,
      transcriptStatus: null,
      durationSeconds: null,
    };
    assertEquals(extractRecallDownloads({}), empty);
    assertEquals(extractRecallDownloads({ recordings: "x" }), empty);
  },
);

Deno.test("extractRecallDownloads drops non-string urls", () => {
  const out = extractRecallDownloads({
    recordings: [
      { media_shortcuts: { video_mixed: { data: { download_url: 5 } } } },
    ],
  });
  assertStrictEquals(out.videoUrl, null);
  assertStrictEquals(out.durationSeconds, null);
});
