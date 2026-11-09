import type { CreateCampaignerArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_campaigner executor and side-effect order. */
export async function executeCreateCampaigner(
  args: CreateCampaignerArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("campaigners")
    .insert({
      full_name: args.full_name,
      phone: args.phone || null,
      email: args.email || null,
      role: args.role || null,
      tenant_id: tenantId,
    })
    .select("id, full_name")
    .single();
  if (error) {
    throw error;
  }
  return { campaigner_id: data.id, full_name: data.full_name };
}
