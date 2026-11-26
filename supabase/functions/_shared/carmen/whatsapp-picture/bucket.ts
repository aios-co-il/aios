/**
 * Where a picture sent to Carmen on WhatsApp waits for its turn (AIO-683): the private
 * `carmen-media` bucket, whose storage policies give each org only its own top folder
 * (`20261009000100_catchup_shipped_schema.sql`), under that org's `whatsapp-inbound` folder.
 * The webhooks write here and run-ai-agent reads here; the file is removed after the turn.
 */
export const WHATSAPP_PICTURES_BUCKET = "carmen-media";

/** The folder inside the org's own folder that holds pictures waiting for a turn. */
export const WHATSAPP_PICTURES_FOLDER = "whatsapp-inbound";

/** The stored path of one picture of an org's turn: `<tenant id>/whatsapp-inbound/<file>`. */
export function whatsappPicturePath(
  tenantId: string,
  fileName: string,
): string {
  return `${tenantId}/${WHATSAPP_PICTURES_FOLDER}/${fileName}`;
}
