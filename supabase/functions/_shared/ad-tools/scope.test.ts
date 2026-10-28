import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { checkClientTarget, clientInScope } from "./scope.ts";
import { A, CA, CRO, store } from "./test-fixtures.ts";

Deno.test("clientInScope: own tenant or a shared agency", () => {
  const c = { id: "c", tenant_id: "t1", agency_id: "ag" };
  assertStrictEquals(clientInScope(c, "t1", []), true);
  assertStrictEquals(clientInScope(c, "t2", ["ag"]), true);
  assertStrictEquals(clientInScope(c, "t2", ["other"]), false);
  const orphan = { id: "o", tenant_id: null, agency_id: "" };
  assertStrictEquals(clientInScope(orphan, "t1", []), false);
});

Deno.test("checkClientTarget: read_only share allows reads only", async () => {
  const s = store();
  assertEquals(
    await checkClientTarget(s, { tenantId: A, access: "read" }, CRO),
    { ok: true },
  );
  const write = await checkClientTarget(
    s,
    { tenantId: A, access: "write" },
    CRO,
  );
  assertStrictEquals(!write.ok && write.status, 403);
  // Absent client_id: nothing to check here.
  assertEquals(
    await checkClientTarget(s, { tenantId: A, access: "write" }, undefined),
    { ok: true },
  );
  const bad = await checkClientTarget(
    s,
    { tenantId: A, access: "write" },
    { id: CA },
  );
  assertStrictEquals(!bad.ok && bad.status, 400);
  // Not a uuid: refused before the clients lookup would fail with a 500.
  let looked = false;
  const notUuid = await checkClientTarget(
    {
      ...s,
      clientsByIds: (ids) => ((looked = true), s.clientsByIds(ids)),
    },
    { tenantId: A, access: "write" },
    "cA",
  );
  assertEquals(notUuid, { ok: false, status: 400, error: "invalid_client_id" });
  assertStrictEquals(looked, false);
});
