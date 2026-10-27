// Sends an image or a document through the Manus WhatsApp gateway, to a
// private chat or a group: report screenshots and documents from the browser
// (multipart, AIO-255) and broadcast images (JSON with a URL).
import { lineSetting } from "../_shared/report-sender/line-access.ts";
import { sendKindColumns } from "../_shared/send-kind.ts";
import {
  internalError,
  json,
  preflight,
} from "../_shared/telephony/response.ts";
import {
  deliverManusMedia,
  type GatewayOutcome,
  type MediaToSend,
} from "./gateway.ts";
import { prepareSend, type SendContext } from "./prepare.ts";
import { uploadReportMedia } from "./upload.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflight();
  }
  try {
    const send = await prepareSend(req);
    if (send instanceof Response) {
      return send;
    }
    const media = await mediaToSend(send);
    const outcome = await deliverManusMedia(fetch, {
      instanceId: lineSetting(send.line.settings, "instance_id") ?? "",
      apiKey: send.line.api_key ?? "",
      to: send.target.to,
      isGroup: send.target.isGroup,
      media,
      caption: send.request.caption,
      captionFallback: send.request.captionFallback,
    });
    if (outcome.status !== "sent") {
      return notSentResponse(outcome);
    }
    await recordSend(send, media, outcome);
    return json({
      success: true,
      messageId: outcome.messageId,
      delivered_as: outcome.deliveredAs,
    });
  } catch (error) {
    return internalError("send-manus-wa-file", error);
  }
});

/** The media URL the gateway fetches; an uploaded file gets a signed URL. */
async function mediaToSend(send: SendContext): Promise<MediaToSend> {
  const { media } = send.request;
  if (media.kind === "url") {
    return media;
  }
  return {
    url: await uploadReportMedia(send.admin, send.tenantId, media.file),
    isImage: media.isImage,
    mimeType: media.file.type || "application/octet-stream",
    filename: media.file.name || null,
  };
}

/**
 * 202 when delivery is unknown (a timeout): the file may have arrived, so the
 * caller must not retry. 502 when the gateway refused or failed.
 */
function notSentResponse(
  outcome: Exclude<GatewayOutcome, { status: "sent" }>,
): Response {
  if (outcome.status === "unknown") {
    return json(
      {
        success: false,
        delivered: "unknown",
        error:
          "Manus gateway did not answer in time; the file may have been delivered. Not retried.",
      },
      202,
    );
  }
  console.error("[send-manus-wa-file] gateway", outcome.status, outcome.detail);
  return json({ error: `Manus WA error ${outcome.detail}` }, 502);
}

/** Stores the send on the chat, stamped with its kind (client card, AIO-242). */
async function recordSend(
  send: SendContext,
  media: MediaToSend,
  outcome: Extract<GatewayOutcome, { status: "sent" }>,
): Promise<void> {
  const { request, isServiceRole, target } = send;
  const { sendKind, sendRef } = request;
  const label = media.isImage
    ? "[תמונה]"
    : `[קובץ: ${media.filename || "file"}]`;
  const { error } = await send.admin.from("chat_messages").insert({
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
