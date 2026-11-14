import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import {
  finalizeMeetingBotSession,
  type MeetingBotSession,
} from "./meeting-bot-finalize.ts";
import {
  createFakeDb,
  type FakeDb,
  fakeClient,
} from "./meeting-bot/fake-db.test-fixture.ts";

const TRANSCRIPT_URL = "https://recall.test/transcript.json";
const SUMMARY_NAME = "פגישת היכרות עם דנה";

const session: MeetingBotSession = {
  id: "session-1",
  tenant_id: "tenant-1",
  client_id: null,
  lead_id: null,
  agency_id: null,
  campaigner_ids: null,
  summary_scope: "auto",
  platform: "teams",
  meeting_topic: null,
  external_bot_id: "bot-1",
  zoom_recording_id: "rec-1",
  scheduled_start: null,
  joined_at: "2026-11-12T12:00:00Z",
  ended_at: "2026-11-12T12:20:00Z",
  created_by: null,
};

/** Recall answers: the bot with a transcript link, and that transcript. */
function recallFetch(transcript: unknown): typeof fetch {
  return (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const body =
      url === TRANSCRIPT_URL
        ? transcript
        : {
            recordings: [
              {
                media_shortcuts: {
                  transcript: {
                    data: { download_url: TRANSCRIPT_URL },
                    status: { code: "done" },
                  },
                },
              },
            ],
          };
    return Promise.resolve(Response.json(body));
  };
}

/** A session whose recording an earlier run made and named. */
function dbWithRecording(summaryGeneratedAt: string | null): FakeDb {
  return createFakeDb({
    meeting_bot_sessions: [{ ...session, status: "processing" }],
    zoom_recordings: [
      {
        id: "rec-1",
        tenant_id: "tenant-1",
        meeting_id: "bot-1",
        meeting_topic: SUMMARY_NAME,
        topic_set_manually: false,
        summary_generated_at: summaryGeneratedAt,
      },
    ],
  });
}

describe("finalizeMeetingBotSession on a re-run", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    Deno.env.set("RECALL_API_KEY", "test-key");
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    Deno.env.delete("RECALL_API_KEY");
  });

  it("does not summarize again or rename a summarized recording", async () => {
    globalThis.fetch = recallFetch([]);
    const db = dbWithRecording("2026-11-12T12:23:00Z");

    const result = await finalizeMeetingBotSession(fakeClient(db), session);

    assertEquals(result, { outcome: "done", detail: "already summarized" });
    assertEquals(db.tables.zoom_recordings[0].meeting_topic, SUMMARY_NAME);
    assertEquals(db.tables.meeting_bot_sessions[0].status, "done");
    assertEquals(
      db.tables.meeting_bot_sessions[0].status_detail,
      "already_summarized",
    );
  });

  it("stops when the summary lands while it downloads", async () => {
    globalThis.fetch = recallFetch([
      {
        participant: { id: 1, name: "דנה" },
        words: [{ text: "שלום", start_timestamp: { relative: 0 } }],
      },
    ]);
    const db = dbWithRecording(null);
    // The other run's summary arrives right after this run writes the row.
    db.afterQuery = (call) => {
      if (call.table === "zoom_recordings" && call.op === "update") {
        db.tables.zoom_recordings[0].summary_generated_at =
          "2026-11-12T12:24:00Z";
      }
    };

    const result = await finalizeMeetingBotSession(fakeClient(db), session);

    assertEquals(result, { outcome: "done", detail: "already summarized" });
    assertEquals(db.tables.zoom_recordings[0].meeting_topic, SUMMARY_NAME);
  });
});
