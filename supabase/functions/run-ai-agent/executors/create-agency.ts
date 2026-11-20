import type { CreateAgencyArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_agency executor and side-effect order. */
export async function executeCreateAgency(
  args: CreateAgencyArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("agencies")
    .insert({
      name: args.name,
      contact_name: args.contact_name || null,
      phone: args.phone || null,
      email: args.email || null,
      tenant_id: tenantId,
    })
    .select("id, name")
    .single();
  if (error) {
    throw error;
  }
  return { agency_id: data.id, name: data.name };
}
