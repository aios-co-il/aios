import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { AdToolAuthResult } from "./caller.ts";
import { authorizeFbToolRequest } from "./fb-gate.ts";
import {
  A,
  CB,
  CRW,
  META_OBJECTS,
  SERVICE,
  identity,
  store,
} from "./test-fixtures.ts";

/** carmen-fb-tools as carmen-approval-execute calls it (AIO-307). */
function approvedFbCall(
  body: Record<string, unknown>,
  calls: Array<string> = [],
) {
  return authorizeFbToolRequest({
    authorization: `Bearer ${SERVICE}`,
    serviceRoleKey: SERVICE,
    body: { confirmed: true, tenant_id: A, approval_id: "approval-1", ...body },
    identity: identity(calls),
    store: store(),
    fetchAccountId: async (src, entityId) => {
      calls.push(
        `fetchAccountId:${src.tenantId}:${src.clientId ?? "own"}:${entityId}`,
      );
      return META_OBJECTS[entityId] ?? null;
    },
  });
}

function denied(res: AdToolAuthResult, error: string) {
  assertStrictEquals(res.ok, false);
  if (!res.ok) {
    assertStrictEquals(res.status, 403);
    assertStrictEquals(res.error, error);
  }
}

Deno.test("authorizeFbToolRequest: an approved action", async (t) => {
  await t.step(
    "is refused for another tenant's campaign or client",
    async () => {
      denied(
        await approvedFbCall({ action: "pause", entity_id: "9002" }),
        "target_out_of_scope",
      );
      denied(
        await approvedFbCall({
          action: "pause",
          entity_id: "9001",
          client_id: CB,
        }),
        "target_out_of_scope",
      );
    },
  );

  await t.step("runs on its own campaign", async () => {
    const res = await approvedFbCall({ action: "pause", entity_id: "9001" });
    assertStrictEquals(res.ok, true);
  });

  await t.step(
    "runs on a client of an agency shared with its tenant, with that client's token",
    async () => {
      const calls: Array<string> = [];
      const res = await approvedFbCall(
        { action: "pause", entity_id: "9003", client_id: CRW },
        calls,
      );
      assertStrictEquals(res.ok, true);
      assertEquals(calls, [`fetchAccountId:${A}:${CRW}:9003`]);
    },
  );
});
