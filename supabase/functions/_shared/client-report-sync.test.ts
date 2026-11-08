import { assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { buildGoogleCustomerClientMap } from "./client-report-sync.mjs";
Deno.test(
  "Google account client mapping surfaces each failed database lookup",
  async () => {
    for (const failAt of [0, 1, 2]) {
      let request = 0;
      const db = createClient("https://example.supabase.co", "key", {
        auth: { persistSession: false },
        global: {
          fetch: async () => {
            const index = request++;
            const body =
              index === failAt
                ? { message: "lookup denied", code: "42501" }
                : index === 1
                  ? [
                      {
                        client_id: "client-a",
                        integration_settings: { account_id: "123" },
                      },
                    ]
                  : [];
            return new Response(JSON.stringify(body), {
              status: index === failAt ? 403 : 200,
              headers: { "Content-Type": "application/json" },
            });
          },
        },
      });
      await assertRejects(() => buildGoogleCustomerClientMap(db, ["tenant-a"]));
    }
  },
);
