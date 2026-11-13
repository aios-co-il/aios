import { assertEquals } from "jsr:@std/assert@1";
import { alreadySummarized, recordingRowFor } from "./existing-recording.ts";

const row = {
  meeting_topic: "Microsoft Teams — כרמן",
  topic_set_manually: false,
  recording_url: "https://recall.example/video.mp4",
};

Deno.test("a new recording takes the bot's name", () => {
  assertEquals(recordingRowFor(row, null), row);
});

Deno.test("a re-run keeps the name the summary gave the recording", () => {
  assertEquals(
    recordingRowFor(row, { id: "rec-1", summary_generated_at: null }),
    { recording_url: "https://recall.example/video.mp4" },
  );
});

Deno.test("a recording with a summary is not summarized again", () => {
  assertEquals(
    alreadySummarized({
      id: "rec-1",
      summary_generated_at: "2026-11-12T12:23:00Z",
    }),
    true,
  );
  assertEquals(
    alreadySummarized({ id: "rec-1", summary_generated_at: null }),
    false,
  );
  assertEquals(alreadySummarized(null), false);
});
