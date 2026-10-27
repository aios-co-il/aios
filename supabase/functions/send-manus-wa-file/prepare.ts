// Everything checked before a Manus file leaves: who calls, for which tenant,
// from which line, to whom, whether the client send guard lets it reach that
// recipient, and whether this environment may send there.
import type { ClientSendGuard } from "../_shared/client-send/types.ts";
import type { GuardResult } from "../_shared/integration-guard.ts";
import {
  callerMaySendForTenant,
  lineSetting,
  type LineStore,
  type SenderLine,
} from "../_shared/report-sender/line-access.ts";
import { json } from "../_shared/telephony/response.ts";
import { clientSendBlock } from "./client-send.ts";
import { resolveManusLine } from "./line.ts";
import { type FileSendRequest, readFileSendRequest } from "./request.ts";
import { manusTarget, type ManusTarget } from "./target.ts";

/** The reads the checks need; deps.ts backs them with the DB and env. */
export type PrepareDeps = {
  authenticate(
    req: Request,
  ): Promise<{ kind: "user" | "service"; userId: string | null } | null>;
  store: LineStore;
  ownManusLine(tenantId: string, userId: string): Promise<SenderLine | null>;
  resolveTenantId(
    request: FileSendRequest,
    userId: string,
  ): Promise<string | null>;
  findGroupChatId(
    tenantId: string,
    groupId: string | null,
  ): Promise<string | null>;
  /** checkWhatsAppSend: Staging sends only to allowlisted phones. */
  guard(destination: string): GuardResult;
  /** The client send guard (AIO-261). */
  clientSendGuard: ClientSendGuard;
};

export type SendContext = {
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
  deps: PrepareDeps,
): Promise<SendContext | Response> {
  const caller = await deps.authenticate(req);
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
  const tenantId = await deps.resolveTenantId(request, userId);
  if (!tenantId) {
    return json({ error: "Tenant not found" }, 404);
  }
  if (!(await callerMaySendForTenant(deps.store, tenantId, userId))) {
    return json({ error: "Forbidden", code: "forbidden" }, 403);
  }
  const choice = await resolveManusLine(deps, {
    tenantId,
    userId,
    integrationId: request.integrationId,
  });
  if ("error" in choice) {
    return lineRefusal(choice.error);
  }
  const target = manusTarget({
    groupId: request.groupId,
    groupChatId: await deps.findGroupChatId(tenantId, request.groupId),
    phoneNumber: request.phoneNumber,
    countryCode: lineSetting(choice.line.settings, "country_code"),
  });
  if ("error" in target) {
    return json({ error: target.error, code: target.error }, 400);
  }
  const refused = await clientSendBlock(deps.clientSendGuard, {
    request,
    isServiceRole,
    tenantId,
    target,
  });
  if (refused) {
    return refused;
  }
  const blocked = stagingBlock(deps.guard, target);
  if (blocked) {
    return blocked;
  }
  return {
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
function stagingBlock(
  guard: PrepareDeps["guard"],
  target: ManusTarget,
): Response | null {
  const result = guard(target.isGroup ? `group:${target.to}` : target.to);
  if (result.decision !== "BLOCK") {
    return null;
  }
  console.warn("[send-manus-wa-file] blocked by integration-guard", result);
  return json(
    {
      error: "blocked_by_staging_safe_mode",
      reason: result.reason,
      environment: result.environment,
    },
    403,
  );
}
