// Media sends through the Manus WhatsApp gateway, which fetches media by URL.

export const MANUS_GATEWAY_URL = "https://whatsappgw-pzpyrrww.manus.space";

/** Manus can take 30-40s on slow paths; a timeout is "delivery unknown". */
export const GATEWAY_TIMEOUT_MS = 60_000;

export type MediaToSend = {
  url: string;
  isImage: boolean;
  mimeType: string;
  filename: string | null;
};

export type DeliverInput = {
  instanceId: string;
  apiKey: string;
  /** Group chat id (…@g.us) or a full phone number. */
  to: string;
  isGroup: boolean;
  media: MediaToSend;
  caption: string;
  /** Send the caption as text when a group rejects the media. */
  captionFallback: boolean;
};

type NotSent = { status: "rejected" | "failed" | "unknown"; detail: string };

type PostResult = { status: "sent"; messageId: string | null } | NotSent;

export type GatewayOutcome =
  | {
      status: "sent";
      messageId: string | null;
      deliveredAs: "media" | "text_fallback";
    }
  | NotSent;

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Sends the media. When the gateway explicitly rejects media to a group and
 * the caption carries the message (a report's caption holds its link), the
 * caption goes to the group once as text. Never on a timeout or a server
 * error: the media may have arrived, and a second message would duplicate it.
 */
export async function deliverManusMedia(
  fetcher: Fetcher,
  input: DeliverInput,
): Promise<GatewayOutcome> {
  const media = await postToGateway(fetcher, input, mediaRequest(input));
  if (media.status === "sent") {
    return { ...media, deliveredAs: "media" };
  }
  const canFallBack =
    media.status === "rejected" &&
    input.isGroup &&
    input.captionFallback &&
    input.caption.trim() !== "";
  if (!canFallBack) {
    return media;
  }
  const text = await postToGateway(fetcher, input, {
    path: "send/group",
    body: { groupId: input.to, body: input.caption },
  });
  return text.status === "sent"
    ? { ...text, deliveredAs: "text_fallback" }
    : text;
}

/** The gateway route and body for a media message (group or private). */
export function mediaRequest(input: DeliverInput): {
  path: string;
  body: Record<string, unknown>;
} {
  const { media } = input;
  const body: Record<string, unknown> = {
    to: input.to,
    caption: input.caption || undefined,
    filename: media.filename || undefined,
  };
  if (media.isImage) {
    return { path: "send/image", body: { ...body, imageUrl: media.url } };
  }
  return {
    path: "send/file",
    body: { ...body, fileUrl: media.url, mimeType: media.mimeType },
  };
}

/**
 * What a gateway reply means. The gateway answers unknown routes with its web
 * app (HTML, status 200), so a 200 alone does not prove a send.
 */
export function classifyGatewayReply(
  status: number,
  text: string,
): { kind: "ok"; messageId: string | null } | { kind: "rejected" | "failed" } {
  if (text.trimStart().startsWith("<")) {
    return { kind: "rejected" };
  }
  if (status >= 500) {
    return { kind: "failed" };
  }
  const reply = parseJson(text);
  if (status >= 400 || reply?.success === false) {
    return { kind: "rejected" };
  }
  const messageId = reply?.messageId;
  return {
    kind: "ok",
    messageId: typeof messageId === "string" ? messageId : null,
  };
}

/** One POST to the gateway, bounded by GATEWAY_TIMEOUT_MS. */
async function postToGateway(
  fetcher: Fetcher,
  input: DeliverInput,
  request: { path: string; body: Record<string, unknown> },
): Promise<PostResult> {
  const url = `${MANUS_GATEWAY_URL}/api/v1/instances/${input.instanceId}/${request.path}`;
  let response: Response;
  let text: string;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "X-Api-Key": input.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    // The request may already have reached WhatsApp: report, never retry.
    const detail = error instanceof Error ? error.name : "network_error";
    return { status: "unknown", detail };
  }
  const reply = classifyGatewayReply(response.status, text);
  if (reply.kind === "ok") {
    return { status: "sent", messageId: reply.messageId };
  }
  const detail = `[${response.status}] ${request.path}: ${text.slice(0, 200)}`;
  return { status: reply.kind, detail };
}

/** The reply as an object, or null when it is not JSON. */
function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : null;
  } catch {
    return null;
  }
}
