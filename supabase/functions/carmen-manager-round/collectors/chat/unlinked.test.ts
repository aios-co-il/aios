import { assert, assertEquals } from "jsr:@std/assert@1";
import { il } from "../../tests/chat-fixtures.ts";
import { unlinkedGroupCandidates } from "./unlinked.ts";

Deno.test("unlinkedGroupCandidates", async (t) => {
  await t.step(
    "one owner-level suggestion per group, with no client attached",
    () => {
      const [found] = unlinkedGroupCandidates([
        {
          group_id: "g9",
          group_chat_id: "999@g.us",
          group_name: "Acme שיווק",
          client_id: "c9",
          client_name: "Acme",
          message_count: 6,
          last_message_at: il("10:00"),
        },
      ]);
      assertEquals(
        [found.kind, found.fingerprint, found.severity, found.client_id],
        ["unlinked_group", "group:999@g.us", "info", null],
      );
      assertEquals(found.evidence.suggested_client_id, "c9");
      assertEquals(found.source_event_at, il("10:00"));
      assert(found.summary_he.includes('הקבוצה "Acme שיווק" לא משויכת ללקוח'));
      assert(found.summary_he.includes("ל-Acme (6 הודעות לאחרונה)"));
    },
  );
});
