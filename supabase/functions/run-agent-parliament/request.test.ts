import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { readHistory, readParliamentRequest } from "./request.ts";

Deno.test(
  "readParliamentRequest exposes body fields and treats non-objects as empty",
  () => {
    const body = readParliamentRequest({
      tenant_id: "t1",
      action: "clarify",
      brain_route_id: 7,
      extra: true,
    });
    assertEquals(body, {
      tenant_id: "t1",
      action: "clarify",
      brain_route_id: 7,
    });
    assertStrictEquals(body.content, undefined);
    for (const raw of [null, "x", 3, ["a"]]) {
      assertEquals(readParliamentRequest(raw), {});
    }
  },
);

Deno.test("readHistory keeps object entries as role/content text", () => {
  assertEquals(
    readHistory([
      { role: "user", content: "hi" },
      { role: "assistant" },
      { role: 1, content: 2 },
    ]),
    [
      { role: "user", content: "hi" },
      { role: "assistant", content: "" },
      { role: "1", content: "2" },
    ],
  );
});

Deno.test("readHistory skips non-object entries and non-arrays", () => {
  assertEquals(readHistory([null, "s", 3, ["user"]]), []);
  assertEquals(readHistory("not-an-array"), []);
  assertEquals(readHistory(undefined), []);
});
