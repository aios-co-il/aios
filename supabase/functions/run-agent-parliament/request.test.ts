import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { readHistory, readParliamentRequest } from "./request.ts";

Deno.test(
  "readParliamentRequest exposes body fields and treats non-objects as empty",
  () => {
    const body = readParliamentRequest({
      tenant_id: "t1",
      action: "clarify",
      brain_route_id: 7,
    });
    assertStrictEquals(body.tenant_id, "t1");
    assertStrictEquals(body.action, "clarify");
    assertStrictEquals(body.brain_route_id, 7);
    assertStrictEquals(body.content, undefined);
    assertEquals(readParliamentRequest(null), {});
    assertEquals(readParliamentRequest("x"), {});
  },
);

Deno.test(
  "readHistory keeps string role/content entries and drops malformed ones",
  () => {
    const ok = { role: "user", content: "hi" };
    assertEquals(
      readHistory([
        ok,
        null,
        { role: "assistant" },
        { role: 1, content: "x" },
        "s",
      ]),
      [ok],
    );
    assertEquals(readHistory("not-an-array"), []);
    assertEquals(readHistory(undefined), []);
  },
);
