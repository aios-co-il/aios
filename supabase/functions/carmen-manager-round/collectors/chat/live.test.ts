import { assertEquals } from "jsr:@std/assert@1";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadLiveChatFindings } from "./live.ts";

Deno.test("loadLiveChatFindings", async (t) => {
  await t.step("the collector's live findings of the tenant", async () => {
    const { db, calls } = recordingClient(() => [
      {
        kind: "unanswered_request",
        fingerprint: "chat:a",
        evidence: { first_pending_at: "2026-10-27T07:00:00Z" },
      },
      { kind: "client_complaint", fingerprint: "chat:b", evidence: [] },
      { kind: "made_up", fingerprint: "chat:c", evidence: {} },
    ]);
    assertEquals(await loadLiveChatFindings(db, TENANT, "chat_sla"), [
      {
        kind: "unanswered_request",
        fingerprint: "chat:a",
        firstPendingAt: "2026-10-27T07:00:00Z",
      },
      { kind: "client_complaint", fingerprint: "chat:b", firstPendingAt: null },
    ]);
    const query = calls[0].query;
    assertEquals(
      [query.get("tenant_id"), query.get("collector"), query.get("status")],
      [
        `eq.${TENANT}`,
        "eq.chat_sla",
        "in.(open,notified,acknowledged,snoozed)",
      ],
    );
  });
});
