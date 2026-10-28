// One Manus file send: every check first, then the upload, the gateway call
// and the chat record. Dependencies are injected so the checks are tested at
// this seam (handler.test.ts) without a database or the gateway.
import { lineSetting } from "../_shared/report-sender/line-access.ts";
import { internalError, json } from "../_shared/telephony/response.ts";
import type { DeliverInput, GatewayOutcome, MediaToSend } from "./gateway.ts";
import { type PrepareDeps, prepareSend, type SendContext } from "./prepare.ts";

export type SentOutcome = Extract<GatewayOutcome, { status: "sent" }>;

/** The checks' reads plus the steps that act: upload, deliver, record. */
export type FileSendDeps = PrepareDeps & {
  upload(tenantId: string, file: File): Promise<string>;
  deliver(input: DeliverInput): Promise<GatewayOutcome>;
  record(
    send: SendContext,
    media: MediaToSend,
    outcome: SentOutcome,
  ): Promise<void>;
};

/**
 * Sends the file once the caller, tenant, line, recipient and environment
 * are checked; nothing is uploaded or sent before that.
 */
export async function handleFileSend(
  req: Request,
  deps: FileSendDeps,
): Promise<Response> {
  try {
    const send = await prepareSend(req, deps);
    if (send instanceof Response) {
      return send;
    }
    const media = await mediaToSend(deps, send);
    const outcome = await deps.deliver({
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
    await deps.record(send, media, outcome);
    return json({
      success: true,
      messageId: outcome.messageId,
      delivered_as: outcome.deliveredAs,
    });
  } catch (error) {
    return internalError("send-manus-wa-file", error);
  }
}

/** The media URL the gateway fetches; an uploaded file gets a signed URL. */
async function mediaToSend(
  deps: FileSendDeps,
  send: SendContext,
): Promise<MediaToSend> {
  const { media } = send.request;
  if (media.kind === "url") {
    return media;
  }
  return {
    url: await deps.upload(send.tenantId, media.file),
    isImage: media.isImage,
    mimeType: media.file.type || "application/octet-stream",
    filename: media.file.name || null,
  };
}

/**
 * 202 when delivery is unknown (a timeout): the file may have arrived, so the
 * caller must not retry. 502 when the gateway refused or failed; its reply
 * stays in the log.
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
  return json({ error: "Manus WA error", code: "send_failed" }, 502);
}
