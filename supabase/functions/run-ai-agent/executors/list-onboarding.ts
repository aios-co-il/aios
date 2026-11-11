import type { ListOnboardingArgs } from "./onboarding-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { OnboardingListRow } from "../tool-contracts-marketing.ts";

/** Preserves the existing list_onboarding executor and side-effect order. */
export async function executeListOnboarding(
  args: ListOnboardingArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let query = supabase
    .from("client_onboarding")
    .select("id, title, status, clients(name)")
    .in("tenant_id", accessibleTenantIds)
    .order("created_at", { ascending: false })
    .limit(args.limit || 20);
  if (args.status) {
    query = query.eq("status", args.status);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return {
    count: data.length,
    onboarding: data.map((o: OnboardingListRow) => ({
      ...o,
      client_name: o.clients?.name,
    })),
  };
}
