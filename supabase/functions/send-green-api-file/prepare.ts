// Everything checked before a Green API file leaves (AIO-255): the caller
// belongs to the tenant, the line is one the tenant may use, there is a
// recipient, the client send guard lets the file reach it (AIO-261), and
// this environment may send there.
import { clientSendRefusal } from "../_shared/client-send/response.ts";
import { clientSendRefusalOf } from "../_shared/client-send/sender-step.ts";
import type { ClientSendGuard } from "../_shared/client-send/types.ts";
import type { GuardResult } from "../_shared/integration-guard.ts";
import {
  callerMaySendForTenant,
  lineSetting,
  type LineStore,
  type SenderLine,
} from "../_shared/report-sender/line-access.ts";
import { resolveGreenApiChatTarget } from "../_shared/send-green-api-file-chat-resolve.mjs";
import { resolveGreenFileLine } from "./sender.ts";

export type GreenFileSendDeps = {
  store: LineStore;
  /** The line used when the call names none (the chat screen). */
  legacyLine(): Promise<SenderLine | null>;
  /** checkWhatsAppSend: Staging sends only to allowlisted phones. */
  guard(destination: string): GuardResult;
  /** The client send guard over the service-role client. */
  clientSendGuard: ClientSendGuard;
};

export type GreenFileSendInput = {
  tenantId: string;
  userId: string;
  integrationId: string | null;
  groupId: string | null;
  groupChatId: string | undefined;
  phoneNumber: string | null;
  /** The body's clientId, sendKind and sendRef, as sent. */
  clientId: string | null;
  /** From index.ts's auth step: a service-role call is a system send. */
  isServiceRole: boolean;
  sendKind: unknown;
  sendRef: unknown;
};

export type GreenFileSend =
  | { line: SenderLine; chatId: string; usedGroupChat: boolean }
  | { refusal: { status: number; body: Record<string, unknown> } };

/** The checked line and chat for the send, or the refusal to return. */
export async function prepareGreenFileSend(
  deps: GreenFileSendDeps,
  input: GreenFileSendInput,
): Promise<GreenFileSend> {
  if (
    !(await callerMaySendForTenant(deps.store, input.tenantId, input.userId))
  ) {
    return refuse(403, { error: "Forbidden", code: "forbidden" });
  }
  const sender = await resolveGreenFileLine({
    store: deps.store,
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    legacyLine: deps.legacyLine,
  });
  if ("error" in sender) {
    return sender.error === "sender_not_allowed"
      ? refuse(403, { error: "sender_not_allowed", code: sender.error })
      : refuse(400, { error: "Green API not configured", code: sender.error });
  }
  const target = resolveGreenApiChatTarget({
    groupId: input.groupId,
    groupChatId: input.groupChatId,
    phoneNumber: input.phoneNumber,
    countryCode: lineSetting(sender.line.settings, "country_code") || "972",
  });
  // The .mjs resolver is untyped JS: check chatId too, so it narrows.
  if (!target.ok || !target.chatId) {
    return refuse(400, { error: target.message, code: target.error });
  }
  const usedGroupChat = target.via === "group";
  // The group row counts only when its chat id is where the file goes.
  const refused = await clientSendRefusalOf(deps.clientSendGuard, {
    functionName: "send-green-api-file",
    tenantId: input.tenantId,
    channel: "whatsapp",
    address: target.chatId,
    groupId: usedGroupChat ? input.groupId : null,
    isServiceRole: input.isServiceRole,
    body: input,
  });
  if (refused) {
    return { refusal: clientSendRefusal(refused) };
  }
  const guard = deps.guard(
    usedGroupChat ? `group:${target.chatId}` : target.chatId,
  );
  if (guard.decision === "BLOCK") {
    console.warn("[send-green-api-file] blocked by integration-guard", guard);
    return refuse(403, {
      error: "blocked_by_staging_safe_mode",
      reason: guard.reason,
      environment: guard.environment,
    });
  }
  return { line: sender.line, chatId: target.chatId, usedGroupChat };
}

/** A refusal with its HTTP status. */
function refuse(status: number, body: Record<string, unknown>): GreenFileSend {
  return { refusal: { status, body } };
}
