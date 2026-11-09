import type { TablesInsert } from "../../_shared/database.types.ts";
import type { CreateOnboardingArgs } from "./onboarding-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_onboarding executor and side-effect order. */
export async function executeCreateOnboarding(
  args: CreateOnboardingArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const payload = {
    title: args.title,
    client_id: args.client_id,
    campaigner_id: args.campaigner_id || null,
    notes: args.notes || null,
    tenant_id: tenantId,
    status: "pending",
  };
  const { data, error } = await supabase
    .from("client_onboarding")
    // Preserve the legacy payload, including database rejection of missing fields/status.
    .insert(payload as TablesInsert<"client_onboarding">)
    .select("id, title, status")
    .single();
  if (error) {
    throw error;
  }
  return { onboarding_id: data.id, title: data.title, status: data.status };
}
