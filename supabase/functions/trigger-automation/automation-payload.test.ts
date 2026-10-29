import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { automationPayloadSchema } from "./automation-payload.ts";

const accepts = (value: unknown) =>
  automationPayloadSchema.safeParse(value).success;

Deno.test("accepts trigger bodies, direct runs and null optionals", () => {
  assertStrictEquals(
    accepts({
      trigger_type: "lead_created",
      tenant_id: "t1",
      data: { lead_id: "l1" },
      source: "crm",
      extra: 1,
    }),
    true,
  );
  assertStrictEquals(
    accepts({ automationId: "a1", payload: { test: true } }),
    true,
  );
  assertStrictEquals(
    accepts({
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

Deno.test("keeps unknown keys and nested data", () => {
  assertEquals(
    automationPayloadSchema.parse({
      trigger_type: "lead_created",
      data: { lead_id: "l1", tags: ["a"] },
      extra: { nested: true },
    }),
    {
      trigger_type: "lead_created",
      data: { lead_id: "l1", tags: ["a"] },
      extra: { nested: true },
    },
  );
});

Deno.test("rejects non-objects and mistyped known fields", () => {
  assertStrictEquals(accepts(null), false);
  assertStrictEquals(accepts([]), false);
  assertStrictEquals(accepts("x"), false);
  assertStrictEquals(accepts({ trigger_type: 5 }), false);
  assertStrictEquals(accepts({ data: [] }), false);
  assertStrictEquals(accepts({ data: "x" }), false);
  assertStrictEquals(accepts({ _execution_depth: "1" }), false);
  assertStrictEquals(accepts({ _execution_chain: [1] }), false);
});
