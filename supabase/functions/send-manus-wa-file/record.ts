// The chat record of a Manus file that went out.
import { sendKindColumns } from "../_shared/send-kind.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { MediaToSend } from "./gateway.ts";
import type { SentOutcome } from "./handler.ts";
import type { SendContext } from "./prepare.ts";

/** Stores the send on the chat, stamped with its kind (client card, AIO-242). */
export async function recordSend(
  admin: DbClient,
  send: SendContext,
  media: MediaToSend,
  outcome: SentOutcome,
): Promise<void> {
  const { request, isServiceRole, target } = send;
  const { sendKind, sendRef } = request;
  const label = media.isImage
    ? "[תמונה]"
    : `[קובץ: ${media.filename || "file"}]`;
  const { error } = await admin.from("chat_messages").insert({
    client_id: request.clientId,
    lead_id: request.leadId,
    group_id: target.isGroup ? request.groupId : null,
    tenant_id: send.tenantId,
    connection_user_id: send.line.user_id || send.userId,
    integration_id: send.line.id,
    message_text: request.caption || label,
    direction: "outbound",
    channel: "whatsapp",
    provider: "manus_wa",
    sent_by_user_id: send.userId,
    raw_provider_data: {
      messageId: outcome.messageId,
      delivered_as: outcome.deliveredAs,
      // A signed upload URL expires and is not kept; a broadcast's URL is.
      fileUrl: request.media.kind === "url" ? media.url : null,
      mimeType: media.mimeType,
      filename: media.filename,
      isImage: media.isImage,
    },
    sender_phone: target.isGroup ? null : target.to,
    ...sendKindColumns({ sendKind, sendRef, isServiceRole }),
  });
  if (error) {
    console.error("[send-manus-wa-file] chat_messages insert failed", error);
  }
}
