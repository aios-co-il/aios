import { assertEquals } from "jsr:@std/assert@1";
import { readToolAction } from "./tool-contracts.ts";
Deno.test("malformed stored tool actions do not abort reconstruction", () => {
  assertEquals(readToolAction(null), null);
  assertEquals(readToolAction({ tool_name: {} }), null);
  assertEquals(
    readToolAction({ tool_name: "search", tool_input: { query: "hello" } }),
    { tool_name: "search", tool_input: { query: "hello" } },
  );
});
