import { assertEquals } from "jsr:@std/assert@1";
import { type ConfirmInput, confirmFindingDraft } from "./confirm.ts";
import type {
  ConfirmOutcome,
  ConfirmRequest,
  DraftFinding,
  FindingDraftPorts,
} from "./ports.ts";

const T = "11111111-1111-4111-8111-111111111111";
const FINDING: DraftFinding = {
  id: "f1",
  kind: "contact_not_logged",
  short_code: 123,
  evidence: {
    attributed: true,
    draft: { update_type: "call", text_he: "שיחה טלפונית עם הלקוח ב־2.11" },
  },
};
const LOGGED: ConfirmOutcome = {
  outcome: "logged",
  entryId: "u1",
  inserted: true,
};

/** Ports over one finding; the database's answer is `outcome`. */
function ports(
  requests: ConfirmRequest[],
  fields: { finding?: DraftFinding | null; outcome?: ConfirmOutcome } = {},
): FindingDraftPorts {
  const finding = fields.finding === undefined ? FINDING : fields.finding;
  return {
    findLive: (tenantId, code) =>
      Promise.resolve(tenantId === T && code === 123 ? finding : null),
    confirm: (request) => {
      requests.push(request);
      return Promise.resolve(fields.outcome ?? LOGGED);
    },
  };
}

function input(fields: Partial<ConfirmInput> = {}): ConfirmInput {
  return {
    tenantId: T,
    args: { short_code: 123 },
    requesterUserId: "dana",
    reply: { shortCode: 123, inGroup: false },
    ...fields,
  };
}

Deno.test("confirmFindingDraft", async (t) => {
  await t.step("logs the draft in the person's name", async () => {
    const requests: ConfirmRequest[] = [];
    const result = await confirmFindingDraft(ports(requests), input());
    assertEquals(requests, [
      {
        tenantId: T,
        findingId: "f1",
        userId: "dana",
        updateType: "call",
        content: "שיחה טלפונית עם הלקוח ב־2.11",
      },
    ]);
    assertEquals(
      [result.success, result.update_id, result.attributed_user_id],
      [true, "u1", "dana"],
    );
  });

  await t.step("logs the person's own wording", async () => {
    const requests: ConfirmRequest[] = [];
    await confirmFindingDraft(
      ports(requests),
      input({ args: { short_code: "#123", content: "דיברנו על התקציב" } }),
    );
    assertEquals(requests[0].content, "דיברנו על התקציב");
  });

  await t.step(
    "only the code the person wrote, in a private chat, by a person",
    async () => {
      const requests: ConfirmRequest[] = [];
      const cases: [Partial<ConfirmInput>, string][] = [
        [{ args: { short_code: 124 } }, "reply_required"],
        [{ reply: { shortCode: null, inGroup: false } }, "reply_required"],
        [{ reply: null }, "reply_required"],
        [{ reply: { shortCode: 123, inGroup: true } }, "private_chat_only"],
        [{ requesterUserId: null }, "human_requester_required"],
      ];
      for (const [fields, error] of cases) {
        const result = await confirmFindingDraft(
          ports(requests),
          input(fields),
        );
        assertEquals([result.success, result.error], [false, error]);
      }
      assertEquals(requests, []);
    },
  );

  await t.step(
    "an unknown code and one the person may not log are refused alike",
    async () => {
      const refused = await confirmFindingDraft(
        ports([], { outcome: { outcome: "not_found" } }),
        input(),
      );
      const unknown = await confirmFindingDraft(
        ports([]),
        input({ args: {}, reply: { shortCode: 7, inGroup: false } }),
      );
      assertEquals(
        [refused.message, unknown.message],
        [
          "לא מצאתי פריט פתוח מספר 123 שאפשר לתעד בשמך.",
          "לא מצאתי פריט פתוח מספר 7 שאפשר לתעד בשמך.",
        ],
      );
    },
  );

  await t.step("a read-only shared card is explained", async () => {
    const result = await confirmFindingDraft(
      ports([], { outcome: { outcome: "read_only" } }),
      input(),
    );
    assertEquals([result.success, result.error], [false, "read_only"]);
  });

  await t.step("a finding without a draft is not confirmable", async () => {
    const requests: ConfirmRequest[] = [];
    const plain = { ...FINDING, kind: "no_contact", evidence: {} };
    const result = await confirmFindingDraft(
      ports(requests, { finding: plain }),
      input(),
    );
    assertEquals([result.error, requests], ["not_found", []]);
  });
});
