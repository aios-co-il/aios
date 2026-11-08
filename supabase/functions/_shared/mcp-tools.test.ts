import { assertEquals } from "jsr:@std/assert@1";
import { MCP_TOOLS_FRESH_MS, storedToolsAreFresh } from "./mcp-tools.ts";

const NOW = Date.parse("2026-11-07T21:00:00Z");
const tools = [{ name: "list_clients" }];

Deno.test("a recent stored tool list is used without a live tools/list", () => {
  // Before AIO-509 every Carmen message asked each MCP server for its tools, one by one.
  const updated_at = new Date(NOW - 60_000).toISOString();
  assertEquals(
    storedToolsAreFresh({ available_tools: tools, updated_at }, NOW),
    true,
  );
});

Deno.test("an old, empty or undated stored list is asked for again", () => {
  const old = new Date(NOW - MCP_TOOLS_FRESH_MS - 1).toISOString();
  assertEquals(
    storedToolsAreFresh({ available_tools: tools, updated_at: old }, NOW),
    false,
  );
  assertEquals(
    storedToolsAreFresh(
      { available_tools: [], updated_at: new Date(NOW).toISOString() },
      NOW,
    ),
    false,
  );
  assertEquals(
    storedToolsAreFresh({ available_tools: tools, updated_at: null }, NOW),
    false,
  );
});
