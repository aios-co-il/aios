import { assertEquals } from "jsr:@std/assert@1";
import {
  ClientCardEntryError,
  type ClientCardEntryInput,
} from "../_shared/client-card/entry-types.ts";
import type { DraftFinding } from "../_shared/manager-round/card-draft-approval.ts";
import { type ApproveDeps, handleApprove } from "./handler.ts";
import type { ApproveRequest } from "./request.ts";

const TENANT = "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019";
const ID = {
  ok: "00000000-0000-4000-8000-000000000001",
  call: "00000000-0000-4000-8000-000000000002",
  bare: "00000000-0000-4000-8000-000000000003",
  broken: "00000000-0000-4000-8000-000000000004",
  refused: "00000000-0000-4000-8000-000000000005",
  hidden: "00000000-0000-4000-8000-000000000006",
  noRole: "00000000-0000-4000-8000-000000000007",
};

const draft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב ₪5,000",
};

/** A live card draft the caller may see; `evidence` overrides its draft. */
function visible(
  id: string,
  evidence: DraftFinding["evidence"] = {
    card_draft: { ...draft, source_ref: `g1:${id}` },
  },
): DraftFinding {
  return { id, client_id: "c1", agency_id: "a1", short_code: 31, evidence };
}

/**
 * Deps over the findings RLS lets the caller see; carmen_finding_role_of
 * gives Dana no role for the noRole finding, the broken draft's write throws
 * and the refused one's is a card refusal.
 */
function deps(seen: Array<DraftFinding>, overrides: Partial<ApproveDeps> = {}) {
  const reads: Array<ApproveRequest> = [];
  const written: Array<ClientCardEntryInput> = [];
  const closed: Array<string> = [];
  const roles: Array<string> = [];
  const d: ApproveDeps = {
    caller: () => Promise.resolve({ kind: "user", userId: "dana" }),
    visibleDrafts: (_authorization, request) => {
      reads.push(request);
      return Promise.resolve(
        seen.filter((finding) => request.findingIds.includes(finding.id)),
      );
    },
    roleOf: (tenantId, finding, userId) => {
      roles.push(
        `${tenantId}:${finding.client_id}:${finding.agency_id}:${userId}`,
      );
      return Promise.resolve(finding === noRoleFinding ? null : "campaigner");
    },
    write: {
      writeEntry(input) {
        if (input.sourceRef === `g1:${ID.broken}`) {
          return Promise.reject(new Error("db down"));
        }
        if (input.sourceRef === `g1:${ID.refused}`) {
          return Promise.reject(
            new ClientCardEntryError("access_denied", "אין גישה ללקוח"),
          );
        }
        written.push(input);
        return Promise.resolve({
          entryId: `e${written.length}`,
          inserted: true,
          userId: "dana",
          attribution: "campaigner",
        });
      },
      resolveWritten(_tenant, findingId, _entry, actor) {
        closed.push(`${findingId}:${actor}`);
        return Promise.resolve(true);
      },
    },
    ...overrides,
  };
  return { d, reads, written, closed, roles };
}

const noRoleFinding = visible(ID.noRole);

/** A POST with a bearer token and `body`. */
function post(body: unknown, token = "Bearer t"): Request {
  return new Request("http://local/approve", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("handleApprove", async (t) => {
  await t.step("a signed-out caller gets 401 and nothing is read", async () => {
    const { d, reads } = deps([visible(ID.ok)], {
      caller: () => Promise.resolve(null),
    });

    const response = await handleApprove(
      post({ tenant_id: TENANT, finding_ids: [ID.ok] }),
      d,
    );

    assertEquals(response.status, 401);
    assertEquals(reads, []);
  });

  await t.step("a bad body gets 400 before any read", async () => {
    const { d, reads } = deps([visible(ID.ok)]);
    const tooMany = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );

    const statuses = await Promise.all(
      [
        { finding_ids: [ID.ok] },
        { tenant_id: TENANT, finding_ids: [] },
        { tenant_id: TENANT, finding_ids: ["nope"] },
        { tenant_id: TENANT, finding_ids: [ID.ok, ID.ok.toUpperCase()] },
        { tenant_id: TENANT, finding_ids: tooMany },
      ].map(async (body) => (await handleApprove(post(body), d)).status),
    );

    assertEquals(statuses, [400, 400, 400, 400, 400]);
    assertEquals(reads, []);
  });

  await t.step(
    "an id the caller cannot see is not_found and never written",
    async () => {
      const { d, reads, written, closed } = deps([visible(ID.ok)]);

      const response = await handleApprove(
        post({ tenant_id: TENANT, finding_ids: [ID.hidden] }),
        d,
      );

      assertEquals(await response.json(), {
        results: [{ id: ID.hidden, status: "not_found" }],
      });
      assertEquals(reads, [{ tenantId: TENANT, findingIds: [ID.hidden] }]);
      assertEquals([written, closed], [[], []]);
    },
  );

  await t.step(
    "a visible draft the person has no role for is not_found and never written",
    async () => {
      const { d, written, closed, roles } = deps([noRoleFinding]);

      const response = await handleApprove(
        post({ tenant_id: TENANT, finding_ids: [ID.noRole] }),
        d,
      );

      assertEquals(await response.json(), {
        results: [{ id: ID.noRole, status: "not_found" }],
      });
      assertEquals(roles, [`${TENANT}:c1:a1:dana`]);
      assertEquals([written, closed], [[], []]);
    },
  );

  await t.step("the service key is not a person and gets 401", async () => {
    const { d, reads } = deps([visible(ID.ok)], {
      caller: () => Promise.resolve({ kind: "service", userId: null }),
    });

    const response = await handleApprove(
      post({ tenant_id: TENANT, finding_ids: [ID.ok] }),
      d,
    );

    assertEquals(response.status, 401);
    assertEquals(reads, []);
  });

  await t.step(
    "approves each visible draft as the caller and reports the rest per id",
    async () => {
      const withCall = visible(ID.call, {
        card_draft: {
          ...draft,
          source_ref: `g1:${ID.call}`,
          contact: {
            update_type: "call",
            source_ref: "group_contact:g1:m2",
            content: "[כרמן · מקבוצת הוואטסאפ] שיחת טלפון עם הלקוח",
            participant_user_id: null,
            reported_at: "2026-11-01T10:00:00Z",
          },
        },
      });
      const { d, written, closed } = deps([
        visible(ID.ok),
        withCall,
        visible(ID.bare, {}),
        visible(ID.broken),
        visible(ID.refused),
      ]);

      const response = await handleApprove(
        post({
          tenant_id: TENANT,
          finding_ids: [
            ID.ok,
            ID.hidden,
            ID.bare,
            ID.broken,
            ID.refused,
            ID.call,
          ],
        }),
        d,
      );

      assertEquals(response.status, 200);
      assertEquals(await response.json(), {
        results: [
          { id: ID.ok, status: "approved" },
          { id: ID.hidden, status: "not_found" },
          { id: ID.bare, status: "no_draft" },
          { id: ID.broken, status: "error" },
          { id: ID.refused, status: "error", code: "access_denied" },
          { id: ID.call, status: "approved" },
        ],
      });
      assertEquals(
        written.map((entry) => [entry.sourceRef, entry.metadata?.approved_by]),
        [
          [`g1:${ID.ok}`, "dana"],
          [`g1:${ID.call}`, "dana"],
          ["group_contact:g1:m2", "dana"],
        ],
      );
      assertEquals(closed, [`${ID.ok}:dana`, `${ID.call}:dana`]);
    },
  );

  await t.step("a failed read answers 502 and writes nothing", async () => {
    const { d, written } = deps([], {
      visibleDrafts: () => Promise.reject(new Error("db down")),
    });

    const response = await handleApprove(
      post({ tenant_id: TENANT, finding_ids: [ID.ok] }),
      d,
    );

    assertEquals(response.status, 502);
    assertEquals(written, []);
  });
});
