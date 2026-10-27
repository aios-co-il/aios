import { assertEquals } from "jsr:@std/assert@1";
import {
  ClientCardEntryError,
  type ClientCardEntryInput,
} from "../../_shared/client-card.ts";
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
  owner_user_id: "dana",
  evidence: { card_draft: draft },
};

function ports(finding: DraftFinding | null, assigned = false, refuse = false) {
  const written: ClientCardEntryInput[] = [];
  const closed: (string | null)[] = [];
  const fake: ApprovalPorts = {
    findLive: (_tenant, code) =>
      Promise.resolve(finding && code === finding.short_code ? finding : null),
    isAssigned: () => Promise.resolve(assigned),
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
  return { fake, written, closed };
}

const input = (fields: Partial<ApproveInput> = {}): ApproveInput => ({
  tenantId: "t1",
  args: { short_code: 31 },
  requesterUserId: "dana",
  caller: {
    campaignerId: null,
    isManagerRole: false,
    isTeamManager: false,
    managedAgencyIds: [],
  },
  now: new Date("2026-11-02T07:00:00Z"),
  ...fields,
});

Deno.test("approveCardDraft", async (t) => {
  await t.step(
    "the finding's person writes the draft and closes it in their name",
    async () => {
      const { fake, written, closed } = ports(live);
      const result = await approveCardDraft(fake, input());
      assertEquals(result.success, true);
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
    "an assigned campaigner may; an unassigned one gets the not-found refusal",
    async () => {
      const asCampaigner = input({
        requesterUserId: "ron",
        caller: { ...input().caller, campaignerId: "camp2" },
      });
      assertEquals(
        (await approveCardDraft(ports(live, true).fake, asCampaigner)).success,
        true,
      );
      const refused = await approveCardDraft(
        ports(live, false).fake,
        asCampaigner,
      );
      assertEquals([refused.success, refused.error], [false, "not_found"]);
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
    const { fake, closed } = ports(live, false, true);
    const result = await approveCardDraft(fake, input());
    assertEquals(
      [result.success, result.error, closed.length],
      [false, "access_denied", 0],
    );
  });
});
