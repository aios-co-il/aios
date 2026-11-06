import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const state: {
  tenantId: string | null;
  failWrite: boolean;
  requests: Array<{
    method: string;
    table: string;
    query: string;
    body: string;
  }>;
} = { tenantId: "tenant-1", failWrite: false, requests: [] };

/** Supply local accounting reads and record the real SDK's income request. */
async function fetchAccounting(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const table = url.pathname.split("/").pop() ?? "";
  state.requests.push({
    method: request.method,
    table,
    query: url.search,
    body: await request.text(),
  });
  if (request.method !== "GET") {
    if (table !== "one_time_incomes") {
      throw new Error(`Unexpected write: ${table}`);
    }
    return state.failWrite
      ? Response.json({ message: "income rejected" }, { status: 400 })
      : new Response(null, { status: 201 });
  }
  return Response.json(
    table === "clients"
      ? [
          {
            id: "client-1",
            name: "Test client",
            status: "active",
            retainer: 0,
            monthly_budget: 0,
            agency_id: null,
            is_seo_client: false,
            services: [],
            monthly_fixed_expense: 0,
            start_date: null,
            end_date: null,
            agencies: null,
          },
        ]
      : [],
  );
}

export const client = createClient<Database>(
  "https://accounting.test",
  "test-key",
  {
    global: { fetch: fetchAccounting },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

/** Select the externally effective writes independently of background read traffic. */
export function incomeWrites() {
  return state.requests.filter((request) => request.method !== "GET");
}
