import { assertEquals } from "jsr:@std/assert@1";
import { executorClient } from "./executor-client.test-fixture.ts";
import { executeSyncMaskyooCdr } from "./sync-maskyoo-cdr.ts";

Deno.test("Maskyoo SDK invocation keeps body and HTTP fallback", async () => {
  const f = executorClient([{}], 403);
  assertEquals(
    await executeSyncMaskyooCdr({ from_date: "2026-01-01" }, f.context),
    { error: "סנכרון נכשל [403]" },
  );
  assertEquals(f.calls[0].body, { tenant_id: "t1", from_date: "2026-01-01" });
});
