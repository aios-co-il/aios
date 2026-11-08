import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "./database.types.ts";
import { assertEquals } from "jsr:@std/assert@1";
import {
  MCP_TOOLS_FRESH_MS,
  storedToolsAreFresh,
  loadMcpTools,
} from "./mcp-tools.ts";

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
    storedToolsAreFresh({ available_tools: tools, updated_at: "" }, NOW),
    false,
  );
});

Deno.test(
  "non-string stored MCP names cannot become callable tools",
  async () => {
    const db = createClient<Database>("https://example.invalid", "key", {
      auth: { persistSession: false },
      global: {
        fetch: async () =>
          new Response(
            JSON.stringify([
              {
                id: "c",
                name: "test",
                url: "https://mcp.invalid",
                state: "ready",
                oauth_tokens: {},
                updated_at: new Date().toISOString(),
                available_tools: [
                  { name: 42 },
                  { name: {} },
                  { name: "" },
                  { name: "list_clients", inputSchema: { type: "object" } },
                ],
              },
            ]),
            { headers: { "Content-Type": "application/json" } },
          ),
      },
    });
    const loaded = await loadMcpTools(db, "tenant");
    assertEquals(
      loaded.toolDefs.map((tool) => tool.name),
      ["mcp_test__list_clients"],
    );
    assertEquals([...loaded.executors.keys()], ["mcp_test__list_clients"]);
  },
);
