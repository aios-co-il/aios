import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** The private bucket; files are read only through signed links. */
const BUCKET = "supplier-invoices";

/** How long a link opened from a click lives. */
const OPEN_URL_SECONDS = 60;

/** The part of an invoice row that says where its file is. */
export type SupplierInvoiceFile = Pick<
  Tables<"supplier_invoices">,
  "file_path" | "file_url"
>;

/** Uploads an invoice file into the tenant's folder and returns its path. */
export async function uploadSupplierInvoiceFile(
  tenantId: string,
  supplierId: string,
  file: File,
): Promise<string> {
  const extension = file.name.split(".").pop();
  const path = `${tenantId}/${supplierId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) {
    throw error;
  }

  return path;
}

/** A one-minute link to an invoice file. */
export async function signSupplierInvoiceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, OPEN_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("supplier invoice file: no signed URL");
  }

  return data.signedUrl;
}

/** Removes an invoice file from storage. */
async function removeSupplierInvoiceFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    throw error;
  }
}

/**
 * Removes a file whose invoice is gone or was never written. A failure is
 * logged, not thrown: the invoice's own outcome is what the caller reports.
 */
export async function removeOrphanedSupplierInvoiceFile(
  path: string,
): Promise<void> {
  try {
    await removeSupplierInvoiceFile(path);
  } catch (error) {
    console.error("Supplier invoice file was not removed:", path, error);
  }
}

/** Deletes an invoice row, then its file, so no file outlives its invoice. */
export async function deleteSupplierInvoice(
  invoice: Pick<Tables<"supplier_invoices">, "id" | "file_path">,
): Promise<void> {
  const { error } = await supabase
    .from("supplier_invoices")
    .delete()
    .eq("id", invoice.id);
  if (error) {
    throw error;
  }
  if (invoice.file_path) {
    await removeOrphanedSupplierInvoiceFile(invoice.file_path);
  }
}
