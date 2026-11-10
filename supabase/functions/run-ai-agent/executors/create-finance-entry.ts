import type { Database } from "../../_shared/database.types.ts";
import type { CreateFinanceEntryArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_finance_entry executor and side-effect order. */
export async function executeCreateFinanceEntry(
  args: CreateFinanceEntryArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("finance")
    .insert({
      amount: args.amount,
      type: args.type,
      description: args.description,
      date: args.date || new Date().toISOString().split("T")[0],
      client_id: args.client_id || null,
      tenant_id: tenantId,
    } as unknown as Database["public"]["Tables"]["finance"]["Insert"])
    .select("id, amount, type, description")
    .single()
    .returns<
      Pick<
        Database["public"]["Tables"]["finance"]["Row"],
        "id" | "amount" | "type"
      >
    >();
  if (error) {
    throw error;
  }
  return { finance_id: data.id, amount: data.amount, type: data.type };
}
