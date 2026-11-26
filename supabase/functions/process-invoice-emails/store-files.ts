import {
  downloadAttachment,
  findInvoiceAttachment,
} from "./gmail-attachments.ts";

/** The part of a storage bucket this needs: called as the user, so storage rules decide who may upload where. */
export type InvoiceBucket = {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: string },
  ): Promise<{ error: { message: string } | null }>;
};

/** An attachment the user chose to keep. */
export type FileToStore = { messageId: string; partId: string };

/** Where the attachment was stored, or why it was not. */
export type StoredFile = FileToStore &
  ({ filePath: string } | { error: string });

const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
};

const SAFE_EXTENSION = /\.([a-z0-9]{1,5})$/i;

/**
 * Copies the chosen attachments from Gmail into the tenant's invoice folder.
 * Runs only when the user saves, so an attachment they looked at and did not
 * keep is never stored. One failed file does not stop the others.
 */
export async function storeInvoiceFiles(
  bucket: InvoiceBucket,
  accessToken: string,
  tenantId: string,
  files: Array<FileToStore>,
): Promise<Array<StoredFile>> {
  const stored: Array<StoredFile> = [];
  for (const file of files) {
    try {
      const filePath = await storeInvoiceFile(
        bucket,
        accessToken,
        tenantId,
        file,
      );
      stored.push({ ...file, filePath });
    } catch (error) {
      console.error("Invoice file was not stored:", error);
      stored.push({ ...file, error: "The file could not be stored" });
    }
  }

  return stored;
}

async function storeInvoiceFile(
  bucket: InvoiceBucket,
  accessToken: string,
  tenantId: string,
  file: FileToStore,
): Promise<string> {
  const attachment = await findInvoiceAttachment(
    accessToken,
    file.messageId,
    file.partId,
  );
  if (!attachment) {
    throw new Error("The message no longer has this attachment");
  }
  const bytes = await downloadAttachment(
    accessToken,
    file.messageId,
    attachment.attachmentId,
  );
  const filePath = `${tenantId}/gmail-invoices/${crypto.randomUUID()}.${fileExtension(attachment)}`;
  const { error } = await bucket.upload(filePath, bytes, {
    contentType: attachment.mimeType,
  });
  if (error) {
    throw new Error(`Invoice file upload failed: ${error.message}`);
  }

  return filePath;
}

/** A storage-safe extension: from the type, else from the name. The full name stays on the invoice row. */
function fileExtension(attachment: {
  filename: string;
  mimeType: string;
}): string {
  const fromName = SAFE_EXTENSION.exec(attachment.filename)?.[1];

  return (
    EXTENSION_BY_TYPE[attachment.mimeType] ?? fromName?.toLowerCase() ?? "bin"
  );
}
