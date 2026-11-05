import { createClient } from "@supabase/supabase-js";

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Array<[string, string]>;
  body: string;
}

let oracleId = 0;

export type QueryTable =
  | "tenant_integrations"
  | "chat_tags"
  | "whatsapp_groups"
  | "clients"
  | "leads"
  | "campaigners";

/** Build the pre-change SDK request as an independent wire-compatibility oracle. */
export async function previousRequest(
  table: QueryTable,
  tenantId: string | null,
  activeOnly = true,
) {
  let captured: CapturedRequest | undefined;
  const client = createClient("https://example.com", "test-key", {
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        captured = {
          url: request.url,
          method: request.method,
          headers: [...request.headers],
          body: await request.text(),
        };
        return new Response("[]", {
          headers: { "content-type": "application/json" },
        });
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `broadcast-oracle-${++oracleId}`,
    },
  });
  const projections: { [table in QueryTable]: string } = {
    tenant_integrations:
      "id, settings, user_id, integration_type, display_name",
    chat_tags: "id, name, color",
    whatsapp_groups: "id, group_name, group_chat_id, description",
    clients: "id, contact_name, name, phone, email, status",
    leads:
      "id, contact_name, company_name, phone, email, status, response_status",
    campaigners: "id, full_name, phone, email",
  };
  const query = client
    .from(table)
    .select(projections[table])
    .eq("tenant_id", tenantId);
  if (table === "tenant_integrations") {
    query
      .in("integration_type", ["green_api", "manus_wa"])
      .eq("is_active", true);
  } else if (table === "chat_tags") {
    query.order("sort_order");
  } else if (table === "whatsapp_groups") {
    query.eq("is_blocked", false).order("group_name", { ascending: true });
  } else {
    if (table === "leads") {
      query.is("archived_at", null);
    }
    if (table === "campaigners" && activeOnly) {
      query.eq("active", true);
    }
    query.limit(1000);
  }
  await query;
  return captured;
}
