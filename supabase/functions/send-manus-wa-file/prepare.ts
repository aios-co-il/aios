// Everything checked before a Manus file leaves: who calls, for which tenant,
// from which line, to whom, and whether this environment may send there.
import { checkWhatsAppSend } from "../_shared/integration-guard.ts";
import {
  callerMaySendForTenant,
  lineSetting,
  lineStore,
  type SenderLine,
} from "../_shared/report-sender/line-access.ts";
import { requireAuth } from "../_shared/security.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { json } from "../_shared/telephony/response.ts";
import { resolveManusLine } from "./line.ts";
import { type FileSendRequest, readFileSendRequest } from "./request.ts";
import { findGroupChatId, manusTarget, type ManusTarget } from "./target.ts";
import { resolveTenantId } from "./tenant.ts";

export type SendContext = {
  admin: DbClient;
  request: FileSendRequest;
  isServiceRole: boolean;
  userId: string;
  tenantId: string;
  line: SenderLine;
  target: ManusTarget;
};

/** The checked send, or the response that refuses it. */
export async function prepareSend(
  req: Request,
): Promise<SendContext | Response> {
  const caller = await requireAuth(req);
  if (!caller) {
    return json({ error: "Unauthorized" }, 401);
  }
  const request = await readFileSendRequest(req);
  if ("error" in request) {
    return json({ error: request.error }, 400);
  }
  const isServiceRole = caller.kind === "service";
  const userId = isServiceRole ? request.senderUserId : caller.userId;
  if (!userId) {
    return json({ error: "senderUserId required for service role" }, 400);
  }
  const admin = serviceClient();
  const store = lineStore(admin);
  const tenantId = await resolveTenantId(admin, request, userId);
  if (!tenantId) {
    return json({ error: "Tenant not found" }, 404);
  }
  if (!(await callerMaySendForTenant(store, tenantId, userId))) {
    return json({ error: "Forbidden" }, 403);
  }
  const choice = await resolveManusLine(admin, store, {
    tenantId,
    userId,
    integrationId: request.integrationId,
  });
  if ("error" in choice) {
    return lineRefusal(choice.error);
  }
  const target = manusTarget({
    groupId: request.groupId,
    groupChatId: await findGroupChatId(admin, tenantId, request.groupId),
    phoneNumber: request.phoneNumber,
    countryCode: lineSetting(choice.line.settings, "country_code"),
  });
  if ("error" in target) {
    return json({ error: target.error, code: target.error }, 400);
  }
  const blocked = stagingBlock(target);
  if (blocked) {
    return blocked;
  }
  return {
    admin,
    request,
    isServiceRole,
    userId,
    tenantId,
    line: choice.line,
    target,
  };
}

/** 403 for a line the tenant may not use, 400 when the tenant has none set up. */
function lineRefusal(error: "sender_not_allowed" | "not_configured"): Response {
  return error === "sender_not_allowed"
    ? json({ error: "sender_not_allowed", code: "sender_not_allowed" }, 403)
    : json(
        { error: "Manus WhatsApp not configured", code: "not_configured" },
        400,
      );
}

/** Staging sends only to allowlisted phones and never to groups. */
function stagingBlock(target: ManusTarget): Response | null {
  const guard = checkWhatsAppSend(
    target.isGroup ? `group:${target.to}` : target.to,
  );
  if (guard.decision !== "BLOCK") {
    return null;
  }
  console.warn("[send-manus-wa-file] blocked by integration-guard", guard);
  return json(
    {
      error: "blocked_by_staging_safe_mode",
      reason: guard.reason,
      environment: guard.environment,
    },
    403,
  );
}
