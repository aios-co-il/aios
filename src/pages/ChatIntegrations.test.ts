import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

type Provider = "manychat" | "green_api" | "manus_wa" | "meta_whatsapp";

describe("chat integration tenant query serialization", () => {
  for (const tenantId of ["tenant-1", null]) {
    for (const provider of [
      "manychat",
      "green_api",
      "manus_wa",
      "meta_whatsapp",
    ] satisfies Array<Provider>) {
      it(`preserves ${provider} requests for tenant ${tenantId}`, async () => {
        const requests: Array<{ url: string; method: string }> = [];
        const captureFetch: typeof fetch = async (input, init) => {
          const request = new Request(input, init);
          requests.push({ url: request.url, method: request.method });
          return new Response("[]", {
            headers: { "content-type": "application/json" },
          });
        };
        const client = createClient("https://example.com", "test-key", {
          global: { fetch: captureFetch },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            storageKey: `chat-integration-test-${provider}-${tenantId}`,
          },
        });

        for (const useFilter of [false, true]) {
          const query = client
            .from("tenant_integrations")
            .select(
              provider === "meta_whatsapp"
                ? "id,user_id,display_name,is_active,settings"
                : "*",
            );
          const tenantQuery = useFilter
            ? query.filter("tenant_id", "eq", tenantId)
            : query.eq("tenant_id", tenantId);
          if (provider === "green_api" || provider === "manus_wa") {
            tenantQuery.eq("user_id", "user-1");
          }
          const providerQuery = tenantQuery.eq("integration_type", provider);
          if (provider === "meta_whatsapp") {
            await providerQuery.order("created_at").limit(1);
          } else {
            await providerQuery.maybeSingle();
          }
        }

        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        expect(new URL(requests[1].url).searchParams.get("tenant_id")).toBe(
          `eq.${tenantId}`,
        );
      });
    }
  }
});
