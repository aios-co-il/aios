import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  checkClientTarget,
  clientInScope,
  googleCustomerVariants,
  isNumericId,
  metaAccountVariants,
} from "./ad-tools-scope.ts";
import { A, store } from "./ad-tools-test-fixtures.ts";

Deno.test("metaAccountVariants: both spellings, digits only", () => {
  assertEquals(metaAccountVariants("123"), ["123", "act_123"]);
  assertEquals(metaAccountVariants("act_123"), ["123", "act_123"]);
  assertStrictEquals(metaAccountVariants("act_1/campaigns"), null);
  assertStrictEquals(metaAccountVariants(null), null);
  assertStrictEquals(metaAccountVariants(""), null);
});

Deno.test("googleCustomerVariants: dashed and plain", () => {
  assertEquals(googleCustomerVariants("123-456-7890"), [
    "1234567890",
    "123-456-7890",
  ]);
  assertEquals(googleCustomerVariants("1234567890"), [
    "1234567890",
    "123-456-7890",
  ]);
  assertEquals(googleCustomerVariants("12345"), ["12345"]);
  assertStrictEquals(googleCustomerVariants("12,3"), null);
  assertStrictEquals(googleCustomerVariants(undefined), null);
});

Deno.test("isNumericId", () => {
  assertStrictEquals(isNumericId("120210"), true);
  assertStrictEquals(isNumericId(120210), true);
  assertStrictEquals(isNumericId("act_1"), false);
  assertStrictEquals(isNumericId("1 OR 1=1"), false);
});

Deno.test("clientInScope: own tenant or a shared agency", () => {
  const c = { id: "c", tenant_id: "t1", agency_id: "ag" };
  assertStrictEquals(clientInScope(c, "t1", []), true);
  assertStrictEquals(clientInScope(c, "t2", ["ag"]), true);
  assertStrictEquals(clientInScope(c, "t2", ["other"]), false);
  const orphan = { id: "o", tenant_id: null, agency_id: null };
  assertStrictEquals(clientInScope(orphan, "t1", []), false);
});

Deno.test("checkClientTarget: read_only share allows reads only", async () => {
  const s = store();
  assertEquals(
    await checkClientTarget(s, { tenantId: A, access: "read" }, "cRO"),
    { ok: true },
  );
  const write = await checkClientTarget(
    s,
    { tenantId: A, access: "write" },
    "cRO",
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
    { id: "cA" },
  );
  assertStrictEquals(!bad.ok && bad.status, 400);
});
