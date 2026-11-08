import { createClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/integrations/supabase/types";

export const state: {
  tenantId: string | null;
  failWrite: boolean;
  incomes: Array<TablesInsert<"one_time_incomes">>;
  requests: Array<{
    method: string;
    table: string;
    query: string;
    body: string;
  }>;
} = { tenantId: "tenant-1", failWrite: false, requests: [], incomes: [] };

/** Supply local accounting reads and record the real SDK's income request. */
async function fetchAccounting(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const table = url.pathname.split("/").pop() ?? "";
  const body = await request.text();
  state.requests.push({
    method: request.method,
    table,
    query: url.search,
    body,
  });
  if (request.method !== "GET") {
    if (table !== "one_time_incomes") {
      throw new Error(`Unexpected write: ${table}`);
    }
    if (state.failWrite) {
      return Response.json({ message: "income rejected" }, { status: 400 });
    }
    const income: TablesInsert<"one_time_incomes"> = JSON.parse(body);
    state.incomes.push({ ...income, id: "income-1" });
    return new Response(null, { status: 201 });
  }
  if (table === "one_time_incomes") {
    return Response.json(
      state.incomes.filter(
        (income) =>
          url.searchParams.get("tenant_id") === `eq.${income.tenant_id}` &&
          url.searchParams.get("payment_month") ===
            `eq.${income.payment_month}`,
      ),
    );
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

/** Observe actual income refresh requests at the SDK's HTTP boundary. */
export function incomeReads() {
  return state.requests.filter(
    (request) =>
      request.method === "GET" && request.table === "one_time_incomes",
  );
}
