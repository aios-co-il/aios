import { assertEquals } from "jsr:@std/assert@1";
import { NOW } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadClosedChatKeys, loadLiveChatFindings } from "./live.ts";

const stored = {
  severity: "warning",
  client_id: "c1",
  agency_id: "a1",
  source_event_at: "2026-10-27T07:00:00Z",
  summary_he: "לקוח א: כפי שנשמר",
  owner_user_id: null,
};

Deno.test("loadLiveChatFindings", async (t) => {
  await t.step(
    "the collector's live findings of the tenant, as stored",
    async () => {
      const { db, calls } = recordingClient(() => [
        {
          ...stored,
          kind: "unanswered_request",
          fingerprint: "chat:a",
          evidence: { first_pending_at: "2026-10-27T07:00:00Z" },
        },
        {
          ...stored,
          kind: "client_complaint",
          fingerprint: "chat:b",
          evidence: [],
        },
        { ...stored, kind: "made_up", fingerprint: "chat:c", evidence: {} },
        {
          ...stored,
          kind: "client_complaint",
          severity: "loud",
          fingerprint: "chat:d",
          evidence: {},
        },
      ]);
      const live = await loadLiveChatFindings(db, TENANT, "chat_sla");
      assertEquals(
        live.map((f) => [f.kind, f.fingerprint, f.firstPendingAt]),
        [
          ["unanswered_request", "chat:a", "2026-10-27T07:00:00Z"],
          ["client_complaint", "chat:b", null],
        ],
      );
      assertEquals(live[1].stored, {
        ...stored,
        kind: "client_complaint",
        severity: "warning",
        fingerprint: "chat:b",
        evidence: {},
      });
      const query = calls[0].query;
      assertEquals(
        [query.get("tenant_id"), query.get("collector"), query.get("status")],
        [
          `eq.${TENANT}`,
          "eq.chat_sla",
          "in.(open,notified,acknowledged,snoozed)",
        ],
      );
    },
  );
});

Deno.test("loadClosedChatKeys", async (t) => {
  await t.step(
    "closed findings about messages in the read window",
    async () => {
      const { db, calls } = recordingClient(() => [
        { kind: "client_complaint", fingerprint: "chat:x:complaint:m1" },
      ]);
      const closed = await loadClosedChatKeys(db, TENANT, "chat_sla", NOW);
      assertEquals([...closed], ["client_complaint|chat:x:complaint:m1"]);
      const query = calls[0].query;
      assertEquals(
        [
          query.get("tenant_id"),
          query.get("collector"),
          query.get("status"),
          query.get("source_event_at"),
        ],
        [
          `eq.${TENANT}`,
          "eq.chat_sla",
          "not.in.(open,notified,acknowledged,snoozed)",
          `gte.${NOW.toISOString()}`,
        ],
      );
    },
  );
});
