import type { ListTasksArgs } from "./task-queries.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Preserves the existing list_tasks executor and side-effect order. */
export async function executeListTasks(
  args: ListTasksArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    callerCampaignerId,
    accessibleTenantIds,
    bypassCampaignerScope,
    callerScope,
  } = context;

  let query = supabase
    .from("tasks")
    .select(
      "id, title, status, priority, due_date, due_time, duration_minutes, clients(name), leads(company_name), campaigners(full_name)",
    )
    .in("tenant_id", accessibleTenantIds)
    .order("priority", { ascending: false })
    .limit(args.limit || 20);
  if (args.status) {
    query = query.eq("status", args.status);
  }
  if (args.client_id) {
    if (callerCampaignerId && !bypassCampaignerScope) {
      await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
    }
    query = query.eq("client_id", args.client_id);
  } else if (callerCampaignerId && !bypassCampaignerScope) {
    const { data: links } = await supabase
      .from("client_team")
      .select("client_id")
      .eq("campaigner_id", callerCampaignerId);
    const ids = (links || []).map((l) => l.client_id);
    query =
      ids.length > 0
        ? query.or(`client_id.is.null,client_id.in.(${ids.join(",")})`)
        : query.is("client_id", null);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return {
    count: data.length,
    tasks: data.map((t) => ({
      ...t,
      client_name: t.clients?.name,
      lead_name: t.leads?.company_name,
      campaigner_name: t.campaigners?.full_name,
    })),
  };
}
