// Everything checked before a Manus file leaves: who calls, for which tenant,
// from which line, to whom, whether the client send guard lets it reach that
// recipient, and whether this environment may send there.
import type { ClientSendGuard } from "../_shared/client-send/types.ts";
import type { GuardResult } from "../_shared/integration-guard.ts";
import {
  callerMaySendForTenant,
  lineSetting,
  resolveSenderLine,
} from "../_shared/report-sender/line-access.ts";
import type {
  LineStore,
  SenderLine,
} from "../_shared/report-sender/line-store.ts";
import {
  lineRefusal,
  type SendRefusal,
  stagingRefusal,
} from "../_shared/report-sender/refusals.ts";
import { json } from "../_shared/telephony/response.ts";
import { clientSendBlock } from "./client-send.ts";
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
  const choice = await resolveSenderLine(
    deps.store,
    {
      caller: caller.kind,
      tenantId,
      userId,
      integrationId: request.integrationId,
      type: "manus_wa",
    },
    () => deps.ownManusLine(tenantId, userId),
  );
  if ("error" in choice) {
    return refusalResponse(lineRefusal(choice.error, "manus_wa"));
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
  return refusalResponse(stagingRefusal(result));
}

/** The JSON response for a refusal. */
function refusalResponse(refusal: SendRefusal): Response {
  return json(refusal.body, refusal.status);
}
