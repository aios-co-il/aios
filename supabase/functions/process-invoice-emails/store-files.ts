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

/** The file kinds an invoice may be stored as, each with its extension. */
const STORED_KINDS = [
  { contentType: "application/pdf", extension: "pdf" },
  { contentType: "image/png", extension: "png" },
  { contentType: "image/jpeg", extension: "jpg" },
  { contentType: "image/gif", extension: "gif" },
  { contentType: "image/webp", extension: "webp" },
  { contentType: "image/tiff", extension: "tiff" },
  { contentType: "image/bmp", extension: "bmp" },
];

/** Extensions a name may carry for a kind above, besides the kind's own. */
const EXTENSION_ALIASES = new Map([
  ["jpeg", "jpg"],
  ["tif", "tiff"],
]);

const NAME_EXTENSION = /\.([a-z0-9]+)$/i;

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
  const kind = storedKind(attachment);
  if (!kind) {
    throw new Error("The attachment is not a PDF or a supported picture");
  }
  const filePath = `${tenantId}/gmail-invoices/${crypto.randomUUID()}.${kind.extension}`;
  const { error } = await bucket.upload(filePath, bytes, {
    contentType: kind.contentType,
  });
  if (error) {
    throw new Error(`Invoice file upload failed: ${error.message}`);
  }

  return filePath;
}

/**
 * The kind the file is stored as: by its type when that is a kind we keep,
 * else by its name's extension. The sender never picks the stored type
 * freely, and anything else is not stored. The full name stays on the row.
 */
function storedKind(attachment: { filename: string; mimeType: string }) {
  const named = NAME_EXTENSION.exec(attachment.filename)?.[1]?.toLowerCase();
  const extension = named ? (EXTENSION_ALIASES.get(named) ?? named) : null;

  return (
    STORED_KINDS.find((kind) => kind.contentType === attachment.mimeType) ??
    STORED_KINDS.find((kind) => kind.extension === extension) ??
    null
  );
}
