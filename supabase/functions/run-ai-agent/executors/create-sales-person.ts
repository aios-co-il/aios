import type { Database } from "../../_shared/database.types.ts";

import type { ToolExecutionContext } from "../tool-context.ts";

type CreateSalesPersonArgs = {
  full_name: string;
  phone?: string;
  email?: string;
};

/** Preserves the existing create_sales_person executor and side-effect order. */
export async function executeCreateSalesPerson(
  args: CreateSalesPersonArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("sales_people")
    .insert({
      full_name: args.full_name,
      phone: args.phone || null,
      email: args.email || null,
      tenant_id: tenantId,
    } as Database["public"]["Tables"]["sales_people"]["Insert"])
    .select("id, full_name")
    .single();
  if (error) {
    throw error;
  }
  return { sales_person_id: data.id, full_name: data.full_name };
}
