import type { ListInvoiceUploadsArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_invoice_uploads executor and side-effect order. */
export async function executeListInvoiceUploads(
  args: ListInvoiceUploadsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("invoice_uploads")
    .select(
      "id, vendor_name, invoice_number, invoice_date, total_amount, currency, status, supplier_id, client_id, finance_id, created_at, error_message",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(args.limit || 30);
  if (args.status) {
    q = q.eq("status", args.status);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data?.length || 0, invoices: data || [] };
}
