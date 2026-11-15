import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  alreadySummarized,
  type MeetingBotRecordingFields,
  recordingRowFor,
  type RecordingName,
} from "./existing-recording.ts";

const fields: MeetingBotRecordingFields = {
  tenant_id: "tenant-1",
  client_id: null,
  lead_id: null,
  agency_id: null,
  campaigner_ids: null,
  summary_scope: "auto",
  meeting_id: "bot-1",
  start_time: "2026-11-12T12:00:00Z",
  duration: 20,
  source: "meeting_bot",
  recording_url: "https://recall.example/video.mp4",
};

const name: RecordingName = {
  meeting_topic: "Microsoft Teams — כרמן",
  topic_set_manually: false,
};

describe("recordingRowFor", () => {
  it("gives a new recording the bot's name", () => {
    assertEquals(recordingRowFor(fields, name, null), { ...fields, ...name });
  });

  it("keeps the name the summary gave an existing recording", () => {
    assertEquals(
      recordingRowFor(fields, name, {
        id: "rec-1",
        summary_generated_at: null,
      }),
      fields,
    );
  });
});

describe("alreadySummarized", () => {
  it("is true only for a recording with a summary stamp", () => {
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
});
