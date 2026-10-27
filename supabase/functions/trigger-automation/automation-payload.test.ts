import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { isAutomationPayload } from "./automation-payload.ts";

Deno.test("accepts trigger bodies, direct runs and null optionals", () => {
  assertStrictEquals(
    isAutomationPayload({
      trigger_type: "lead_created",
      tenant_id: "t1",
      data: { lead_id: "l1" },
      source: "crm",
      extra: 1,
    }),
    true,
  );
  assertStrictEquals(
    isAutomationPayload({ automationId: "a1", payload: { test: true } }),
    true,
  );
  assertStrictEquals(
    isAutomationPayload({
      trigger_type: "x",
      tenant_id: null,
      data: null,
      _execution_id: "e1",
      _execution_depth: 2,
      _execution_chain: ["k1"],
    }),
    true,
  );
});

Deno.test("rejects non-objects and mistyped known fields", () => {
  assertStrictEquals(isAutomationPayload(null), false);
  assertStrictEquals(isAutomationPayload([]), false);
  assertStrictEquals(isAutomationPayload("x"), false);
  assertStrictEquals(isAutomationPayload({ trigger_type: 5 }), false);
  assertStrictEquals(isAutomationPayload({ data: [] }), false);
  assertStrictEquals(isAutomationPayload({ data: "x" }), false);
  assertStrictEquals(isAutomationPayload({ _execution_depth: "1" }), false);
  assertStrictEquals(isAutomationPayload({ _execution_chain: [1] }), false);
});
