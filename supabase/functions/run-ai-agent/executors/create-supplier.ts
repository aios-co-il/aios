import type { Database } from "../../_shared/database.types.ts";
import type { CreateSupplierArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_supplier executor and side-effect order. */
export async function executeCreateSupplier(
  args: CreateSupplierArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: args.name,
      type: args.type || "other",
      phone: args.phone || null,
      email: args.email || null,
      tenant_id: tenantId,
    } as Database["public"]["Tables"]["suppliers"]["Insert"])
    .select("id, name")
    .single();
  if (error) {
    throw error;
  }
  return { supplier_id: data.id, name: data.name };
}
