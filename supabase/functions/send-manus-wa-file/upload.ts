// Browser files for Manus: the gateway fetches media by URL, so an uploaded
// report goes to the private report-media bucket and the gateway gets a
// short-lived signed URL. Reports hold client data: never the public bucket.
import type { DbClient } from "../_shared/supabase-clients.ts";

export const REPORT_MEDIA_BUCKET = "report-media";

/** Long enough for the gateway to fetch, short enough to stay private. */
export const REPORT_MEDIA_URL_TTL_SECONDS = 60 * 60;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

/** Uploads the file and returns a signed URL the gateway can fetch. */
export async function uploadReportMedia(
  admin: DbClient,
  tenantId: string,
  file: File,
): Promise<string> {
  const path = reportMediaPath(tenantId, file, new Date(), crypto.randomUUID());
  const bucket = admin.storage.from(REPORT_MEDIA_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) {
    throw uploadError;
  }
  const { data, error } = await bucket.createSignedUrl(
    path,
    REPORT_MEDIA_URL_TTL_SECONDS,
  );
  if (error) {
    throw error;
  }
  return data.signedUrl;
}

/** <tenant>/<yyyy-mm>/<id>.<ext>, so a tenant's files stay in its folder. */
export function reportMediaPath(
  tenantId: string,
  file: { name: string; type: string },
  now: Date,
  id: string,
): string {
  const month = now.toISOString().slice(0, 7);
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase();
  const extension = fromName || EXTENSION_BY_MIME[file.type] || "bin";
  return `${tenantId}/${month}/${id}.${extension}`;
}
