import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1";

import { fakeSupabase } from "../testing/fake-supabase.ts";
import { openRunRequest, type RunSource } from "./run-request.ts";
import type { RunAuth } from "./run-tenant-access.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const MEMBER_B = "44444444-4444-4444-8444-444444444444";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROW = "a0000000-0000-4000-8000-00000000000a";
const SERVICE: RunAuth = { kind: "service", userId: null };
const USER_A: RunAuth = { kind: "user", userId: MEMBER_A };

/** MEMBER_A belongs to TENANT_A; AGENT_B is TENANT_B's. */
function db() {
  return fakeSupabase({
    tenant_users: [{ tenant_id: TENANT_A, user_id: MEMBER_A }],
    ai_agents: [{ id: AGENT_B, tenant_id: TENANT_B }],
  });
}

/** What a caller is answered for a body (sent as is when it is text), and the tables read. */
async function opened(
  auth: RunAuth | null,
  body: unknown,
  source: RunSource = { field: "row_id" },
) {
  const sb = db();
  const req = new Request("https://edge.test/fn", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const result = await openRunRequest(req, sb, async () => auth, source);

  return { result, reads: sb.queries.map((query) => query.table) };
}

Deno.test("openRunRequest", async (t) => {
  await t.step("answers 401 to no caller, body and tables unread", async () => {
    assertEquals(await opened(null, "{not json"), {
      result: { ok: false, status: 401, error: "unauthorized" },
      reads: [],
    });
  });

  for (const [what, body] of [
    ["a body that is not JSON", "{not json"],
    ["a null body", null],
    ["an array body", [{ row_id: ROW, tenant_id: TENANT_A }]],
    ["a body with no tenant", { row_id: ROW }],
    ["a body with no source row", { tenant_id: TENANT_A }],
  ] as const) {
    await t.step(`answers 400 to ${what}, tables unread`, async () => {
      const refused = {
        ok: false,
        status: 400,
        error: "missing or invalid row_id/tenant_id",
      };

      assertEquals(await opened(USER_A, body), { result: refused, reads: [] });
      assertEquals(await opened(SERVICE, body), { result: refused, reads: [] });
    });
  }

  await t.step("binds a member to their own user id", async () => {
    const { result } = await opened(USER_A, {
      row_id: ROW,
      tenant_id: TENANT_A,
      user_id: MEMBER_B,
    });

    assertObjectMatch(result, {
      ok: true,
      tenantId: TENANT_A,
      sourceId: ROW,
      userId: MEMBER_A,
    });
  });

  await t.step("refuses a member another tenant", async () => {
    const { result } = await opened(USER_A, {
      row_id: ROW,
      tenant_id: TENANT_B,
    });

    assertObjectMatch(result, { ok: false, status: 403 });
  });

  await t.step(
    "refuses a member another tenant's agent as the source",
    async () => {
      const body = { row_id: AGENT_B, tenant_id: TENANT_A };

      assertObjectMatch(await opened(USER_A, body), { result: { ok: true } });
      assertObjectMatch(
        await opened(USER_A, body, { field: "row_id", isAgent: true }),
        {
          result: {
            ok: false,
            status: 403,
            error: "This agent belongs to another organization",
          },
        },
      );
    },
  );

  await t.step(
    "lets a service caller name the tenant and the user, unread",
    async () => {
      const body = { row_id: ROW, tenant_id: TENANT_B, user_id: MEMBER_B };

      assertEquals(await opened(SERVICE, body), {
        result: {
          ok: true,
          body,
          tenantId: TENANT_B,
          sourceId: ROW,
          userId: MEMBER_B,
        },
        reads: [],
      });
    },
  );

  await t.step("reads a service caller's malformed user as none", async () => {
    const { result } = await opened(SERVICE, {
      row_id: ROW,
      tenant_id: TENANT_B,
      user_id: [MEMBER_B],
    });

    assertObjectMatch(result, { ok: true, userId: null });
  });
});
