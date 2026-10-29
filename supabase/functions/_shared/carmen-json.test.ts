import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  isChatTurn,
  isPermanentError,
  jsonField,
  jsonObjectOrNull,
  jsonString,
  mergeCarmenStepConfig,
  policyEntriesAreParsed,
  toCarmenAutomationConfig,
} from "./carmen-json.ts";

Deno.test("asJsonObject reads only plain objects", () => {
  assertEquals(asJsonObject({ a: 1 }), { a: 1 });
  assertEquals(asJsonObject(null), {});
  assertEquals(asJsonObject(undefined), {});
  assertEquals(asJsonObject(["a"]), {});
  assertEquals(asJsonObject("abc"), {});
  assertEquals(asJsonObject({ a: { b: [1, null] } }), { a: { b: [1, null] } });
});

Deno.test("jsonObjectOrNull is null for non-objects", () => {
  assertEquals(jsonObjectOrNull({ a: 1 }), { a: 1 });
  for (const value of [null, undefined, ["a"], "abc", 3, true]) {
    assertStrictEquals(jsonObjectOrNull(value), null);
  }
});

Deno.test(
  "policyEntriesAreParsed checks the first entry for a string phone",
  () => {
    assertStrictEquals(
      policyEntriesAreParsed([{ phone: "972501234567" }]),
      true,
    );
    assertStrictEquals(
      policyEntriesAreParsed([{ phone: 972501234567 }]),
      false,
    );
    assertStrictEquals(policyEntriesAreParsed(["972501234567"]), false);
    assertStrictEquals(policyEntriesAreParsed([]), false);
    assertStrictEquals(policyEntriesAreParsed(null), false);
  },
);

Deno.test("isPermanentError reads a truthy permanent flag", () => {
  assertStrictEquals(
    isPermanentError(Object.assign(new Error("x"), { permanent: true })),
    true,
  );
  assertStrictEquals(isPermanentError({ permanent: false }), false);
  assertStrictEquals(isPermanentError(new Error("x")), false);
  assertStrictEquals(isPermanentError("permanent"), false);
  assertStrictEquals(isPermanentError(null), false);
});

Deno.test("jsonString and jsonField", () => {
  assertStrictEquals(jsonString("x"), "x");
  assertStrictEquals(jsonString(5), null);
  assertStrictEquals(jsonField({ role: "user" }, "role"), "user");
  assertStrictEquals(jsonField(null, "role"), undefined);
  assertStrictEquals(jsonField(["user"], "role"), undefined);
});

Deno.test("isChatTurn accepts user/assistant turns with string content", () => {
  assertStrictEquals(isChatTurn({ role: "user", content: "hi" }), true);
  assertStrictEquals(isChatTurn({ role: "assistant", content: "" }), true);
  assertStrictEquals(isChatTurn({ role: "system", content: "hi" }), false);
  assertStrictEquals(isChatTurn({ role: "user", content: 5 }), false);
  assertStrictEquals(isChatTurn(null), false);
  assertStrictEquals(isChatTurn("user"), false);
});

Deno.test("automation config keeps string and numeric LID aliases", () => {
  assertEquals(toCarmenAutomationConfig({ agent_id: "a" }), {
    agent_id: "a",
  });
  assertEquals(
    toCarmenAutomationConfig({
      agent_id: "a",
      carmen_lid_aliases: {
        "123": "972501234567",
        "456": 972509876543,
        "789": null,
        "790": true,
        "791": { phone: "972501111111" },
      },
    }),
    {
      agent_id: "a",
      carmen_lid_aliases: { "123": "972501234567", "456": "972509876543" },
    },
  );
  assertEquals(toCarmenAutomationConfig({ carmen_lid_aliases: null }), {
    carmen_lid_aliases: {},
  });
});

Deno.test("step configuration overrides the automation configuration", () => {
  assertEquals(
    mergeCarmenStepConfig(
      {
        agent_id: "auto",
        end_keyword: "bye",
        carmen_lid_aliases: { "1": "2" },
      },
      { agent_id: "step", carmen_lid_aliases: { "9": 972501234567 } },
    ),
    {
      agent_id: "step",
      end_keyword: "bye",
      carmen_lid_aliases: { "9": "972501234567" },
    },
  );
});

Deno.test("non-object automation configuration merges as empty", () => {
  for (const automationConfig of [null, undefined, "x", 5, ["a"]]) {
    assertEquals(mergeCarmenStepConfig(automationConfig, { agent_id: "s" }), {
      agent_id: "s",
    });
  }
});
