import { assertEquals } from "jsr:@std/assert@1";
import { approveCardDraft } from "./approve.ts";
import {
  draft,
  input,
  live,
  ports,
  ROLES,
  said,
  withCall,
} from "./approve-fixtures.ts";

Deno.test("approveCardDraft", async (t) => {
  await t.step(
    "a campaigner the feed shows it to writes the draft and closes it in their name",
    async () => {
      const { fake, written, closed, asked } = ports(live);
      const result = await approveCardDraft(fake, input());
      assertEquals(result.success, true);
      assertEquals(result.message, "נרשם בכרטיס הלקוח (פריט 31).");
      assertEquals(
        written.map((e) => [
          e.source,
          e.sourceRef,
          e.content,
          e.countsAsContact,
          e.attributedUserId,
        ]),
        [["group_digest", "g1:m9", draft.content, false, null]],
      );
      assertEquals(closed, ["dana"]);
      assertEquals(asked, [["t1", "c1", "a1", "dana"]]);
    },
  );

  await t.step(
    "a reported call is written as contact, vouched for by the approver",
    async () => {
      const { fake, written } = ports(withCall);
      // The owner approves; the message names nobody, so the campaigner owns it.
      const result = await approveCardDraft(
        fake,
        input({ requesterUserId: "boss" }),
      );
      assertEquals(
        written.map((e) => [
          e.source,
          e.sourceRef,
          e.countsAsContact,
          e.attributedUserId,
        ]),
        [
          ["group_digest", "g1:m9", false, null],
          ["carmen_confirmed", "group_contact:g1:m2", true, "dana"],
        ],
      );
      assertEquals(written[1].metadata, {
        finding_id: "f1",
        short_code: 31,
        written_by: "approval",
        approved_by: "boss",
        attributed_to: "summary_author",
        reported_at: "2026-11-01T10:00:00Z",
      });
      assertEquals(result.contact_update_id, "e1");
      assertEquals(
        result.message,
        "נרשם בכרטיס הלקוח (פריט 31), והשיחה שדווחה בקבוצה נרשמה כקשר עם הלקוח.",
      );
    },
  );

  await t.step(
    "their own wording replaces the draft, still labelled as a group summary",
    async () => {
      const { fake, written } = ports(live);
      await approveCardDraft(
        fake,
        input({ args: { short_code: "#31", content: "אישר ₪5,000 לנובמבר" } }),
      );
      assertEquals(
        written[0].content,
        "[כרמן · סיכום קבוצה] אישר ₪5,000 לנובמבר",
      );
    },
  );

  await t.step(
    "someone the database's rule gives no role gets the not-found refusal",
    async () => {
      const { fake, written } = ports(live);
      const refused = await approveCardDraft(
        fake,
        input({ requesterUserId: "ron" }),
      );
      assertEquals(
        [refused.success, refused.error, written.length],
        [false, "not_found", 0],
      );
    },
  );

  await t.step(
    "an unknown code and a finding without a draft look the same",
    async () => {
      const unknown = await approveCardDraft(
        ports(live).fake,
        input({ args: { short_code: 99 }, reply: said("אשר 99") }),
      );
      const noDraft = await approveCardDraft(
        ports({ ...live, evidence: {} }).fake,
        input(),
      );
      assertEquals([unknown.error, noDraft.error], ["not_found", "not_found"]);
    },
  );

  await t.step("an owner may", async () => {
    const asOwner = await approveCardDraft(
      ports(live).fake,
      input({ requesterUserId: "boss" }),
    );
    assertEquals([asOwner.success, asOwner.resolved], [true, true]);
  });

  await t.step("an automated run cannot approve", async () => {
    const { fake, written } = ports(live);
    const result = await approveCardDraft(
      fake,
      input({ requesterUserId: null }),
    );
    assertEquals(
      [result.error, written.length],
      ["human_requester_required", 0],
    );
  });

  await t.step("a refused card write is read back, not thrown", async () => {
    const { fake, closed } = ports(live, ROLES, true);
    const result = await approveCardDraft(fake, input());
    assertEquals(
      [result.success, result.error, closed.length],
      [false, "access_denied", 0],
    );
  });
});
