import { assertEquals } from "jsr:@std/assert@1";
import { approveCardDraft } from "./approve.ts";
import {
  draft,
  input,
  live,
  ports,
  said,
  withCall,
} from "./approve-fixtures.ts";

// approve_card_draft reads the code and "בלי שיחה" from the person's own
// message (finding-draft/reply.ts), never from the model's arguments alone.
Deno.test("approveCardDraft and the typed reply", async (t) => {
  await t.step(
    "a group session is refused before any lookup, naming no draft",
    async () => {
      const { fake, written, looked } = ports(live);
      const result = await approveCardDraft(
        fake,
        input({
          reply: said("אשר 31", { chat_id: "120363@g.us" }),
          requesterUserId: "boss",
        }),
      );
      assertEquals(
        [result.error, written.length, looked.length],
        ["private_chat_only", 0, 0],
      );
      const text = JSON.stringify(result);
      assertEquals(
        [text.includes("31"), text.includes("תקציב")],
        [false, false],
      );
    },
  );

  await t.step(
    '"אשר 31 בלי שיחה" writes no call, even when the model omits it',
    async () => {
      const { fake, written, closed } = ports(withCall);
      const result = await approveCardDraft(
        fake,
        input({ reply: said("אשר 31 בלי שיחה") }),
      );
      assertEquals(
        written.map((e) => e.source),
        ["group_digest"],
      );
      assertEquals([result.contact_update_id, closed], [null, ["dana"]]);
      assertEquals(result.message, "נרשם בכרטיס הלקוח (פריט 31).");
    },
  );

  await t.step("only the code the person typed writes anything", async () => {
    // "כן תרשמי" has no code; a code from history or Carmen's own message is not typed.
    for (const fields of [
      { reply: said("כן תרשמי") },
      { reply: said("מה עם הפריט?") },
      { args: { short_code: 77 } },
    ]) {
      const { fake, written, looked } = ports(live);
      const result = await approveCardDraft(fake, input(fields));
      assertEquals(
        [result.error, written.length, looked.length],
        ["reply_required", 0, 0],
      );
    }
  });
});
