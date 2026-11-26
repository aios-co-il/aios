import { z } from "zod";
import { removeSupplierInvoiceFile } from "@/components/forms/supplierInvoiceFiles";
import { supabase } from "@/integrations/supabase/client";

/** A reviewed row the user chose to save as a supplier invoice. */
export type GmailInvoiceToSave = {
  messageId: string;
  partId: string;
  supplierId: string;
  invoiceName: string;
  invoiceAmount: number;
  invoiceDate: string | null;
  invoiceMonth: string;
  fileName: string | null;
  aiExtracted: boolean;
  notes: string;
};

const storedFilesSchema = z.object({
  results: z.array(
    z.object({
      messageId: z.string(),
      partId: z.string(),
      filePath: z.string().optional(),
    }),
  ),
});

/** Names one attachment of one message. */
export function gmailInvoiceKey(row: {
  messageId: string;
  partId: string;
}): string {
  return `${row.messageId}:${row.partId}`;
}

/**
 * Saves the chosen rows: their attachments are copied from Gmail into storage
 * only now, then each invoice is written with its file's path. Returns the
 * keys of the rows that were saved; a row whose file or invoice failed stays
 * unsaved for another try, and its file is removed.
 */
export async function saveGmailInvoices(
  tenantId: string,
  invoices: Array<GmailInvoiceToSave>,
): Promise<Array<string>> {
  const { data, error } = await supabase.functions.invoke(
    "process-invoice-emails",
    {
      body: {
        action: "store",
        tenantId,
        files: invoices.map(({ messageId, partId }) => ({ messageId, partId })),
      },
    },
  );
  if (error) {
    throw error;
  }
  const filePaths = new Map(
    storedFilesSchema
      .parse(data)
      .results.flatMap((file) =>
        file.filePath ? [[gmailInvoiceKey(file), file.filePath]] : [],
      ),
  );

  const saved: Array<string> = [];
  for (const invoice of invoices) {
    const key = gmailInvoiceKey(invoice);
    const filePath = filePaths.get(key);
    if (filePath && (await insertInvoice(tenantId, invoice, filePath))) {
      saved.push(key);
    }
  }

  return saved;
}

/** Writes one invoice; on failure removes its file and returns false. */
async function insertInvoice(
  tenantId: string,
  invoice: GmailInvoiceToSave,
  filePath: string,
): Promise<boolean> {
  const { error } = await supabase.from("supplier_invoices").insert({
    tenant_id: tenantId,
    supplier_id: invoice.supplierId,
    invoice_name: invoice.invoiceName,
    invoice_amount: invoice.invoiceAmount,
    invoice_date: invoice.invoiceDate,
    invoice_month: invoice.invoiceMonth,
    file_path: filePath,
    file_name: invoice.fileName,
    ai_extracted: invoice.aiExtracted,
    notes: invoice.notes,
  });
  if (!error) {
    return true;
  }
  console.error("Gmail invoice was not saved:", error);
  try {
    await removeSupplierInvoiceFile(filePath);
  } catch (removeError) {
    console.error("Unsaved Gmail invoice file was not removed:", removeError);
  }

  return false;
}
