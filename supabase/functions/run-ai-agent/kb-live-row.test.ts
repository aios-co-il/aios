import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { loadKbLiveRow } from "./kb-live-row.ts";
Deno.test(
  "KB live source requests scope every supported table to accessible tenants",
  async () => {
    const urls: Array<URL> = [];
    const db = createClient<Database>("https://example.supabase.co", "key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          urls.push(new URL(String(input)));
          return new Response("null", {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    for (const table of [
      "clients",
      "campaigners",
      "tasks",
      "chat_messages",
      "leads",
    ]) {
      await loadKbLiveRow(db, table, "record-id", ["tenant-a"]);
    }
    assertEquals(urls.length, 5);
    for (const url of urls) {
      assertEquals(url.searchParams.get("tenant_id"), "in.(tenant-a)");
    }
  },
);
Deno.test("KB live source database errors are surfaced", async () => {
  const db = createClient<Database>("https://example.supabase.co", "key", {
    auth: { persistSession: false },
    global: {
      fetch: async () =>
        new Response(JSON.stringify({ message: "denied", code: "42501" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    },
  });
  await assertRejects(() =>
    loadKbLiveRow(db, "clients", "record-id", ["tenant-a"]),
  );
});
