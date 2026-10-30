import type { DbClient } from "../_shared/supabase-clients.ts";
import { isRecord } from "../_shared/client-card/is-record.ts";
import { recordCarmenFallbackGroupReply } from "../_shared/client-card/system-send.ts";

/** How long the gateway's response body may take; the message is already out. */
const RESPONSE_BODY_TIMEOUT_MS = 5000;

/**
 * Records Carmen's webhook-fallback group reply once the Manus gateway accepted
 * it, like a reply through her automation's send step: only in a client's
 * group and only while the tenant has card logging on. Never throws.
 */
export async function recordManusFallbackReply(
  res: Response,
  ctx: {
    db: Pick<DbClient, "from" | "rpc">;
    tenantId: string;
    chatId: string;
    message: string;
    connectionUserId: string | null | undefined;
    integrationId: string | null | undefined;
  },
): Promise<void> {
  if (!res.ok) {
    return;
  }
  const response = await readJsonWithin(res, RESPONSE_BODY_TIMEOUT_MS);
  if (isRecord(response) && response.success === false) {
    return;
  }
  await recordCarmenFallbackGroupReply(ctx.db, {
    tenantId: ctx.tenantId,
    chatId: ctx.chatId,
    message: ctx.message,
    provider: "manus_wa",
    connectionUserId: ctx.connectionUserId,
    integrationId: ctx.integrationId,
    providerResponse: response,
  });
}

/** The response's JSON body, or null when it is unreadable or takes longer than `ms`. */
export async function readJsonWithin(
  res: Response,
  ms: number,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = res.json().catch((err) => {
    console.error(
      "[manus-wa-webhook] unreadable gateway response",
      String(err),
    );
    return null;
  });
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([body, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
