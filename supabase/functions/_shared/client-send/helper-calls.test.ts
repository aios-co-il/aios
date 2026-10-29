import { assertEquals } from "jsr:@std/assert@1";
import { helperCalls, passedOnHelper } from "./helper-calls.ts";
import { maskSource } from "./source-mask.ts";

const SOURCE = [
  "const send = async (payload: Record<string, unknown>) => {",
  "  await fetch(url, { body: JSON.stringify({ tenantId, ...payload }) });",
  "};",
  "await send({ groupId });",
  "other.send({ phone });",
].join("\n");

Deno.test("helper calls", async (t) => {
  const { code } = maskSource(SOURCE);
  const fetchOpen = code.indexOf("fetch(") + "fetch".length;
  const call = { open: fetchOpen, close: code.indexOf(");", fetchOpen) + 1 };

  await t.step("the helper whose parameter a request sends", () => {
    assertEquals(passedOnHelper(code, call), "send");
  });

  await t.step("each direct call of it, not a method of the same name", () => {
    const calls = helperCalls(code, "send").map((use) =>
      code.slice(use.open, use.close + 1),
    );
    assertEquals(calls, ["({ groupId })"]);
  });
});
