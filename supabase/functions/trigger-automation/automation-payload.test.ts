import { test } from "node:test";
import assert from "node:assert/strict";
import { isAutomationPayload } from "./automation-payload.ts";

test("accepts trigger bodies, direct runs and null optionals", () => {
  assert.equal(
    isAutomationPayload({
      trigger_type: "lead_created",
      tenant_id: "t1",
      data: { lead_id: "l1" },
      source: "crm",
      extra: 1,
    }),
    true,
  );
  assert.equal(
    isAutomationPayload({ automationId: "a1", payload: { test: true } }),
    true,
  );
  assert.equal(
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

test("rejects non-objects and mistyped known fields", () => {
  assert.equal(isAutomationPayload(null), false);
  assert.equal(isAutomationPayload([]), false);
  assert.equal(isAutomationPayload("x"), false);
  assert.equal(isAutomationPayload({ trigger_type: 5 }), false);
  assert.equal(isAutomationPayload({ data: [] }), false);
  assert.equal(isAutomationPayload({ data: "x" }), false);
  assert.equal(isAutomationPayload({ _execution_depth: "1" }), false);
  assert.equal(isAutomationPayload({ _execution_chain: [1] }), false);
});
