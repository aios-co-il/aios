import type { ToolExecutionContext } from "../tool-context.ts";

type ListCampaignersArgs = { limit?: number };

/** Preserves the existing list_campaigners executor and side-effect order. */
export async function executeListCampaigners(
  args: ListCampaignersArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("campaigners")
    .select("id, full_name, phone, email, role")
    .in("tenant_id", accessibleTenantIds)
    .order("full_name")
    .limit(args.limit || 50);
  if (error) {
    throw error;
  }
  return { count: data.length, campaigners: data };
}
