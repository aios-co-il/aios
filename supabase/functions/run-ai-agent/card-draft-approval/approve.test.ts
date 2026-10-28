import { assertEquals } from "jsr:@std/assert@1";
import {
  ClientCardEntryError,
  type ClientCardEntryInput,
} from "../../_shared/client-card/entry-types.ts";
import { approveCardDraft, type ApproveInput } from "./approve.ts";
import type { ApprovalPorts, DraftFinding } from "./ports.ts";

const draft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב ₪5,000",
};
const live: DraftFinding = {
  id: "f1",
  client_id: "c1",
  agency_id: "a1",
  short_code: 31,
  evidence: { card_draft: draft },
};

/** Each person's role for the finding in t1, as carmen_finding_role_of answers. */
const ROLES: Record<string, string> = { dana: "campaigner", boss: "owner" };

/**
 * Fake ports over one live finding: `roles` stands for the database's rule
 * (anyone missing has no role), and `refuse` makes the card write fail.
 */
function ports(
  finding: DraftFinding | null,
  roles: Record<string, string> = ROLES,
  refuse = false,
) {
  const written: ClientCardEntryInput[] = [];
  const closed: (string | null)[] = [];
  const looked: number[] = [];
  const asked: unknown[][] = [];
  const fake: ApprovalPorts = {
    findLive: (_tenant, code) => {
      looked.push(code);
      return Promise.resolve(
        finding && code === finding.short_code ? finding : null,
      );
    },
    roleOf: (tenant, scope, userId) => {
      asked.push([tenant, scope.client_id, scope.agency_id, userId]);
      return Promise.resolve(roles[userId] ?? null);
    },
    write: {
      writeEntry(input) {
        if (refuse) {
          return Promise.reject(
            new ClientCardEntryError("access_denied", "אין גישה ללקוח"),
          );
        }
        written.push(input);
        return Promise.resolve({
          entryId: "e1",
          inserted: true,
          userId: "dana",
          attribution: "campaigner",
        });
      },
      resolveWritten(_tenant, _finding, _entry, actor) {
        closed.push(actor);
        return Promise.resolve(true);
      },
    },
  };
  return { fake, written, closed, looked, asked };
}

/** Dana's private-chat reply "אשר 31" in tenant t1; `fields` override. */
const input = (fields: Partial<ApproveInput> = {}): ApproveInput => ({
  tenantId: "t1",
  args: { short_code: 31 },
  requesterUserId: "dana",
  isGroup: false,
  ...fields,
});

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
        input({ args: { short_code: 99 } }),
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

  await t.step(
    "a group session is refused before any lookup, naming no draft",
    async () => {
      const { fake, written, looked } = ports(live);
      const result = await approveCardDraft(
        fake,
        input({ isGroup: true, requesterUserId: "boss" }),
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
