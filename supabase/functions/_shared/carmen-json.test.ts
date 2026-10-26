import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  isChatTurn,
  jsonField,
  jsonString,
  toCarmenAutomationConfig,
} from "./carmen-json.ts";

Deno.test("asJsonObject reads only plain objects", () => {
  assertEquals(asJsonObject({ a: 1 }), { a: 1 });
  assertEquals(asJsonObject(null), {});
  assertEquals(asJsonObject(undefined), {});
  assertEquals(asJsonObject(["a"]), {});
  assertEquals(asJsonObject("abc"), {});
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

Deno.test("automation config keeps fields and only string LID aliases", () => {
  assertEquals(toCarmenAutomationConfig({ agent_id: "a" }), {
    agent_id: "a",
  });
  assertEquals(
    toCarmenAutomationConfig({
      agent_id: "a",
      carmen_lid_aliases: { "123": "972501234567", "456": 7 },
    }),
    { agent_id: "a", carmen_lid_aliases: { "123": "972501234567" } },
  );
  assertEquals(toCarmenAutomationConfig({ carmen_lid_aliases: null }), {
    carmen_lid_aliases: {},
  });
});
