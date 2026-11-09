import type { GetClientRetainerArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Preserves the existing get_client_retainer executor and side-effect order. */
export async function executeGetClientRetainer(
  args: GetClientRetainerArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds, callerScope } = context;

  let clientId = args.client_id as string | undefined;
  if (!clientId && args.client_name) {
    const { data: found } = await supabase
      .from("clients")
      .select("id, name")
      .in("tenant_id", accessibleTenantIds)
      .ilike("name", `%${args.client_name}%`)
      .limit(1)
      .maybeSingle();
    clientId = found?.id;
  }
  if (!clientId) {
    return { error: "client_id או client_name נדרש" };
  }
  await assertCallerCanAccessClient(supabase, clientId, callerScope);
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, name, status, retainer, monthly_budget, monthly_fixed_expense")
    .eq("id", clientId)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  if (error || !client) {
    return { error: "לקוח לא נמצא" };
  }
  const { data: overlay } = await supabase
    .from("client_tenant_financial_data")
    .select("retainer, monthly_budget, notes")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();
  return {
    client_id: client.id,
    name: client.name,
    status: client.status,
    retainer: Number(overlay?.retainer ?? client.retainer ?? 0) || 0,
    monthly_budget:
      Number(overlay?.monthly_budget ?? client.monthly_budget ?? 0) || 0,
    monthly_fixed_expense: Number(client.monthly_fixed_expense ?? 0) || 0,
    notes: overlay?.notes || null,
    source: overlay ? "client_tenant_financial_data" : "clients",
  };
}
