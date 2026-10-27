import { assertEquals } from "jsr:@std/assert@1";
import {
  ClientCardEntryError,
  type ClientCardEntryInput,
} from "../../_shared/client-card.ts";
import { type ConfirmInput, confirmFindingDraft } from "./confirm.ts";
import type { DraftFinding, FindingDraftPorts } from "./ports.ts";

const T = "11111111-1111-4111-8111-111111111111";
const FINDING: DraftFinding = {
  id: "f1",
  client_id: "c1",
  agency_id: "a1",
  kind: "contact_not_logged",
  short_code: 123,
  owner_user_id: "dana",
  evidence: {
    attributed: true,
    draft: { update_type: "call", text_he: "שיחה טלפונית עם הלקוח ב־2.11" },
  },
};

type Log = { cards: ClientCardEntryInput[]; resolved: string[] };

function ports(
  log: Log,
  fields: {
    finding?: DraftFinding | null;
    assigned?: boolean;
    fail?: boolean;
  } = {},
): FindingDraftPorts {
  const finding = fields.finding === undefined ? FINDING : fields.finding;
  return {
    findLive: (tenantId, code) =>
      Promise.resolve(tenantId === T && code === 123 ? finding : null),
    isAssigned: () => Promise.resolve(fields.assigned ?? false),
    writeCard: (input) => {
      if (fields.fail) {
        return Promise.reject(new ClientCardEntryError("access_denied", "x"));
      }
      log.cards.push(input);
      return Promise.resolve({
        entryId: "u1",
        inserted: true,
        userId: input.attributedUserId ?? "",
        attribution: "attributed" as const,
      });
    },
    resolve: (_tenant, id, actor) => {
      log.resolved.push(`${id}:${actor}`);
      return Promise.resolve(true);
    },
  };
}

function input(fields: Partial<ConfirmInput> = {}): ConfirmInput {
  return {
    tenantId: T,
    args: { short_code: 123 },
    requesterUserId: "dana",
    caller: {
      campaignerId: "k-dana",
      isManagerRole: false,
      isTeamManager: false,
      managedAgencyIds: [],
    },
    now: new Date("2026-11-03T10:00:00Z"),
    ...fields,
  };
}

Deno.test("confirmFindingDraft", async (t) => {
  await t.step(
    "the caller logs the draft as their counting call and resolves it",
    async () => {
      const log: Log = { cards: [], resolved: [] };
      const result = await confirmFindingDraft(ports(log), input());
      assertEquals(result.success, true);
      assertEquals(log.cards[0], {
        tenantId: T,
        clientId: "c1",
        content: "שיחה טלפונית עם הלקוח ב־2.11",
        updateType: "call",
        source: "carmen_confirmed",
        sourceRef: "finding:f1",
        attributedUserId: "dana",
        countsAsContact: true,
        metadata: {
          tool: "confirm_finding_draft",
          finding_id: "f1",
          short_code: 123,
          finding_owner_user_id: "dana",
          confirmed_by: "dana",
        },
      });
      assertEquals(log.resolved, ["f1:dana"]);
    },
  );

  await t.step("a manager's own wording is logged in their name", async () => {
    const log: Log = { cards: [], resolved: [] };
    await confirmFindingDraft(
      ports(log),
      input({
        requesterUserId: "avi",
        args: { short_code: "#123", content: "דיברנו על התקציב" },
        caller: { ...input().caller, isManagerRole: true },
      }),
    );
    assertEquals(
      [log.cards[0].content, log.cards[0].attributedUserId],
      ["דיברנו על התקציב", "avi"],
    );
  });

  await t.step(
    "others, unknown codes and runs without a person are refused alike",
    async () => {
      const log: Log = { cards: [], resolved: [] };
      const stranger = await confirmFindingDraft(
        ports(log),
        input({ requesterUserId: "noa" }),
      );
      const unknown = await confirmFindingDraft(
        ports(log),
        input({ args: { short_code: 7 } }),
      );
      assertEquals(
        [stranger.message, unknown.message],
        [
          "לא מצאתי פריט פתוח מספר 123 שאפשר לתעד בשמך.",
          "לא מצאתי פריט פתוח מספר 7 שאפשר לתעד בשמך.",
        ],
      );
      const automated = await confirmFindingDraft(
        ports(log),
        input({ requesterUserId: null }),
      );
      assertEquals(automated.error, "human_requester_required");
      assertEquals(log.cards, []);
    },
  );

  await t.step(
    "an office-line call is the client's campaigners' to log",
    async () => {
      const office = {
        ...FINDING,
        evidence: {
          attributed: false,
          draft: { update_type: "call", text_he: "שיחה טלפונית עם הלקוח" },
        },
      };
      const log: Log = { cards: [], resolved: [] };
      const noa = input({ requesterUserId: "noa" });
      const refused = await confirmFindingDraft(
        ports(log, { finding: office }),
        noa,
      );
      assertEquals(refused.error, "not_found");
      const allowed = await confirmFindingDraft(
        ports(log, { finding: office, assigned: true }),
        noa,
      );
      assertEquals(allowed.success, true);
    },
  );

  await t.step(
    "a card write refusal is read back, nothing resolved",
    async () => {
      const log: Log = { cards: [], resolved: [] };
      const result = await confirmFindingDraft(
        ports(log, { fail: true }),
        input(),
      );
      assertEquals([result.success, result.error], [false, "access_denied"]);
      assertEquals(log.resolved, []);
    },
  );

  await t.step("a finding without a draft is not confirmable", async () => {
    const log: Log = { cards: [], resolved: [] };
    const plain = { ...FINDING, kind: "no_contact", evidence: {} };
    const result = await confirmFindingDraft(
      ports(log, { finding: plain }),
      input(),
    );
    assertEquals(result.error, "not_found");
  });
});
