import { assertEquals } from "jsr:@std/assert@1";
import { executeKbSearch } from "./kb-search.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "knowledge search sends a vector string and omits absent SQL-default arguments",
  async () => {
    const f = executorClient([[{ id: "pointer" }]]);
    const result = await executeKbSearch({ query: "hello" }, f.context, () =>
      Promise.resolve([0.25, -0.5]),
    );
    assertEquals(result.mode, "semantic");
    assertEquals(
      new URL(f.calls[0].url).pathname,
      "/rest/v1/rpc/kb_match_pointers",
    );
    assertEquals(f.calls[0].body, {
      p_tenant_id: "t1",
      p_query_embedding: "[0.25,-0.5]",
      p_limit: 20,
    });
  },
);

Deno.test("knowledge search retains supplied semantic filters", async () => {
  const f = executorClient([[]]);
  await executeKbSearch(
    { query: "hello", category: "clients", since_days: 7, limit: 4 },
    f.context,
    () => Promise.resolve([1]),
  );
  assertEquals(f.calls[0].body, {
    p_tenant_id: "t1",
    p_query_embedding: "[1]",
    p_category: "clients",
    p_since_days: 7,
    p_limit: 4,
  });
});

Deno.test(
  "knowledge search still uses scoped text fallback without an embedding",
  async () => {
    const f = executorClient([[]]);
    const result = await executeKbSearch({ query: "hello" }, f.context, () =>
      Promise.resolve(null),
    );
    assertEquals(result.mode, "text");
    const url = new URL(f.calls[0].url);
    assertEquals(url.pathname, "/rest/v1/carmen_memory_pointers");
    assertEquals(url.searchParams.get("tenant_id"), "in.(t1,shared)");
  },
);
