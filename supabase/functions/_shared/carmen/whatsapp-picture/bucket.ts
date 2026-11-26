/**
 * Where a picture sent to Carmen on WhatsApp waits for its turn (AIO-683): the private
 * `carmen-media` bucket, under `whatsapp-inbound/<tenant id>/`. The bucket's storage policies
 * let a signed-in member reach only a top folder named by their org's id
 * (`20261009000100_catchup_shipped_schema.sql`), so no member can list or read this folder,
 * not even while the turn runs: a picture from a chat a member may not see stays hidden from
 * them. Only the service client writes and reads it, and the file is removed after the turn.
 */
export const WHATSAPP_PICTURES_BUCKET = "carmen-media";

/** The top folder that holds pictures waiting for a turn, one folder per org inside it. */
export const WHATSAPP_PICTURES_FOLDER = "whatsapp-inbound";

/** The stored path of one picture of an org's turn: `whatsapp-inbound/<tenant id>/<file>`. */
export function whatsappPicturePath(
  tenantId: string,
  fileName: string,
): string {
  return `${WHATSAPP_PICTURES_FOLDER}/${tenantId}/${fileName}`;
}
