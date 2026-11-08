import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { completeAccessibleTask } from "./complete-task.ts";
Deno.test(
  "task completion requires a returned row and tenant filter",
  async () => {
    let url: URL | undefined;
    const db = createClient<Database>("https://example.supabase.co", "key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          url = new URL(String(input));
          return new Response("null", {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    await assertRejects(() =>
      completeAccessibleTask(db, "task-a", ["tenant-a"]),
    );
    assertEquals(url?.searchParams.get("tenant_id"), "in.(tenant-a)");
    assertEquals(url?.searchParams.get("select"), "id");
  },
);
