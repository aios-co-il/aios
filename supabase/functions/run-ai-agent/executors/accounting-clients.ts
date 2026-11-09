import type { GetAccountingOverviewArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AccountingClientRow } from "../tool-contracts-marketing.ts";
import type { FinancialOverlayRow } from "../tool-contracts-marketing.ts";

/** Loads clients and tenant-specific financial overlays before payment reads. */
export async function loadAccountingClients(
  args: GetAccountingOverviewArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds } = context;
  let agencyId = args.agency_id as string | undefined;
  if (!agencyId && args.agency_name) {
    const { data: ag } = await supabase
      .from("agencies")
      .select("id, name")
      .in("tenant_id", accessibleTenantIds)
      .ilike("name", `%${args.agency_name}%`)
      .limit(1)
      .maybeSingle();
    agencyId = ag?.id;
  }
  let clientsQ = supabase
    .from("clients")
    .select(
      "id, name, status, agency_id, retainer, monthly_budget, monthly_fixed_expense, agencies(name)",
    )
    .in("tenant_id", accessibleTenantIds)
    .in("status", ["active", "onboarding", "paused"]);
  if (agencyId) {
    clientsQ = clientsQ.eq("agency_id", agencyId);
  }
  const { data: clients, error: cErr } = await clientsQ.limit(500);
  if (cErr) {
    throw cErr;
  }
  const clientRows: Array<AccountingClientRow> = clients || [];
  const clientIds = clientRows.map((c) => c.id);
  const { data: ctfd }: { data: Array<FinancialOverlayRow> | null } =
    clientIds.length
      ? await supabase
          .from("client_tenant_financial_data")
          .select("client_id, retainer, monthly_budget")
          .eq("tenant_id", tenantId)
          .in("client_id", clientIds)
      : { data: [] };
  const finMap = new Map((ctfd || []).map((r) => [r.client_id, r] as const));
  const enriched = clientRows.map((c) => {
    const overlay = finMap.get(c.id);
    const retainer = Number(overlay?.retainer ?? c.retainer ?? 0) || 0;
    return {
      client_id: c.id,
      name: c.name,
      status: c.status,
      agency: c.agencies?.name || null,
      retainer,
      monthly_budget:
        Number(overlay?.monthly_budget ?? c.monthly_budget ?? 0) || 0,
      monthly_fixed_expense: Number(c.monthly_fixed_expense ?? 0) || 0,
    };
  });

  return { agencyId, enriched };
}
