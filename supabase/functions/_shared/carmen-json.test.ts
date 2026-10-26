import assert from "node:assert/strict";
import test from "node:test";
import {
  asJsonObject,
  isChatTurn,
  jsonField,
  jsonString,
  toCarmenAutomationConfig,
} from "./carmen-json.ts";

test("asJsonObject reads only plain objects", () => {
  assert.deepEqual(asJsonObject({ a: 1 }), { a: 1 });
  assert.deepEqual(asJsonObject(null), {});
  assert.deepEqual(asJsonObject(undefined), {});
  assert.deepEqual(asJsonObject(["a"]), {});
  assert.deepEqual(asJsonObject("abc"), {});
});

test("jsonString and jsonField", () => {
  assert.equal(jsonString("x"), "x");
  assert.equal(jsonString(5), null);
  assert.equal(jsonField({ role: "user" }, "role"), "user");
  assert.equal(jsonField(null, "role"), undefined);
  assert.equal(jsonField(["user"], "role"), undefined);
});

test("isChatTurn accepts user/assistant turns with string content", () => {
  assert.equal(isChatTurn({ role: "user", content: "hi" }), true);
  assert.equal(isChatTurn({ role: "assistant", content: "" }), true);
  assert.equal(isChatTurn({ role: "system", content: "hi" }), false);
  assert.equal(isChatTurn({ role: "user", content: 5 }), false);
  assert.equal(isChatTurn(null), false);
  assert.equal(isChatTurn("user"), false);
});

test("automation config keeps fields and only string LID aliases", () => {
  assert.deepEqual(toCarmenAutomationConfig({ agent_id: "a" }), {
    agent_id: "a",
  });
  assert.deepEqual(
    toCarmenAutomationConfig({
      agent_id: "a",
      carmen_lid_aliases: { "123": "972501234567", "456": 7 },
    }),
    { agent_id: "a", carmen_lid_aliases: { "123": "972501234567" } },
  );
  assert.deepEqual(toCarmenAutomationConfig({ carmen_lid_aliases: null }), {
    carmen_lid_aliases: {},
  });
});
