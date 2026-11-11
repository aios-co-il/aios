import type { UpdateOnboardingStatusArgs } from "./onboarding-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing update_onboarding_status executor and side-effect order. */
export async function executeUpdateOnboardingStatus(
  args: UpdateOnboardingStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("client_onboarding")
    .update({ status: args.status })
    .eq("id", args.onboarding_id)
    .in("tenant_id", accessibleTenantIds)
    .select("id, title, status")
    .single();
  if (error) {
    throw error;
  }
  return data;
}
