import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

describe("broadcast domain tenant filter requests", () => {
  for (const tenantId of ["tenant-1", null]) {
    for (const operation of ["list", "add-default", "update", "set-default"]) {
      it(`preserves ${operation} for tenant ${tenantId}`, async () => {
        const requests: Array<{
          url: string;
          method: string;
          headers: Array<[string, string]>;
          body: string;
        }> = [];
        const captureFetch: typeof fetch = async (input, init) => {
          const request = new Request(input, init);
          requests.push({
            url: request.url,
            method: request.method,
            headers: Array.from(request.headers.entries()),
            body: await request.text(),
          });
          return new Response("[]", {
            headers: { "content-type": "application/json" },
          });
        };
        const client = createClient("https://example.com", "test-key", {
          global: { fetch: captureFetch },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            storageKey: `broadcast-domain-${operation}-${tenantId}`,
          },
        });

        for (const useFilter of [false, true]) {
          const table = client.from("broadcast_email_domains");
          const query =
            operation === "list"
              ? table.select("*")
              : operation === "update"
                ? table
                    .update({
                      domain: "example.com",
                      default_local: "noreply",
                      from_name: null,
                    })
                    .eq("id", "domain-1")
                : table.update({ is_default: false });
          const tenantQuery = useFilter
            ? query.filter("tenant_id", "eq", tenantId)
            : query.eq("tenant_id", tenantId);
          if (operation === "list") {
            tenantQuery
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: true });
          }
          await tenantQuery;
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
