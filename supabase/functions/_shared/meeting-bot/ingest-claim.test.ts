import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  claimSessionIngest,
  INGESTING,
  isIngesting,
  notLiveIngestFilter,
  STALE_INGEST_MS,
} from "./ingest-claim.ts";
import { createFakeDb, fakeClient } from "./fake-db.test-fixture.ts";

const read = {
  id: "session-1",
  tenant_id: "tenant-1",
  updated_at: "2026-11-12T12:20:37Z",
  ended_at: null,
};

/** A database holding one `processing` session as both callers read it. */
function sessionDb(status = "processing") {
  return createFakeDb({
    meeting_bot_sessions: [{ ...read, status, status_detail: null }],
  });
}

describe("claimSessionIngest", () => {
  it("lets exactly one of two callers holding the same read finalize", async () => {
    const db = sessionDb();
    const webhook = await claimSessionIngest(fakeClient(db), read);
    const reconcile = await claimSessionIngest(fakeClient(db), read);

    assertEquals([webhook, reconcile], [true, false]);
    assertEquals(db.tables.meeting_bot_sessions[0].status_detail, INGESTING);
  });

  it("gives nothing for a session that is already done", async () => {
    const db = sessionDb("done");

    assertEquals(await claimSessionIngest(fakeClient(db), read), false);
    assertEquals(db.tables.meeting_bot_sessions[0].status, "done");
  });

  it("stamps ended_at when the session has none", async () => {
    const db = sessionDb();
    await claimSessionIngest(fakeClient(db), read);

    assertEquals(typeof db.tables.meeting_bot_sessions[0].ended_at, "string");
  });
});

describe("live ingest", () => {
  it("is recognised by its status_detail", () => {
    assertEquals(isIngesting({ status_detail: INGESTING }), true);
    assertEquals(isIngesting({ status_detail: "awaiting_transcript" }), false);
  });

  it("is filtered out in SQL until it goes stale", () => {
    const now = Date.parse("2026-11-12T12:30:00Z");
    const staleBefore = new Date(now - STALE_INGEST_MS).toISOString();

    assertEquals(
      notLiveIngestFilter(now),
      `status_detail.is.null,status_detail.neq.ingesting,updated_at.lt.${staleBefore}`,
    );
  });
});
