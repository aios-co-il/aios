import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const queries = [
  {
    table: "tenant_integrations",
    select: "id, settings, user_id, integration_type, display_name",
  },
  { table: "chat_tags", select: "id, name, color" },
  {
    table: "whatsapp_groups",
    select: "id, group_name, group_chat_id, description",
  },
  { table: "clients", select: "id, contact_name, name, phone, email, status" },
  {
    table: "leads",
    select:
      "id, contact_name, company_name, phone, email, status, response_status",
  },
  { table: "campaigners", select: "id, full_name, phone, email" },
];

describe("BroadcastWizard tenant query request equivalence", () => {
  for (const tenantId of ["tenant-1", null]) {
    for (const { table, select } of queries) {
      for (const activeOnly of table === "campaigners"
        ? [false, true]
        : [false]) {
        it(`preserves ${table} requests and refetch for ${tenantId}, active=${activeOnly}`, async () => {
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
              headers: [...request.headers.entries()],
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
              detectSessionInUrl: false,
              storageKey: `broadcast-test-${table}-${tenantId}-${activeOnly}`,
            },
          });

          for (const useFilter of [false, true]) {
            const base = client.from(table).select(select);
            const query = useFilter
              ? base.filter("tenant_id", "eq", tenantId)
              : base.eq("tenant_id", tenantId);
            if (table === "tenant_integrations") {
              query
                .in("integration_type", ["green_api", "manus_wa"])
                .eq("is_active", true);
            } else if (table === "chat_tags") {
              query.order("sort_order");
            } else if (table === "whatsapp_groups") {
              query.eq("is_blocked", false).order("group_name", {
                ascending: true,
              });
            } else {
              if (table === "leads") {
                query.is("archived_at", null);
              }
              if (activeOnly) {
                query.eq("active", true);
              }
              query.limit(1000);
            }
            await query;
            await query;
          }

          expect(requests).toHaveLength(4);
          expect(requests[2]).toEqual(requests[0]);
          expect(requests[3]).toEqual(requests[1]);
          expect(requests[3]).toEqual(requests[2]);
          expect(requests[2].method).toBe("GET");
          expect(requests[2].body).toBe("");
          expect(new URL(requests[2].url).searchParams.get("tenant_id")).toBe(
            `eq.${tenantId}`,
          );
        });
      }
    }
  }
});
