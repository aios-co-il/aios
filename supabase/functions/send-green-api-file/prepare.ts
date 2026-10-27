// Everything checked before a Green API file leaves (AIO-255): the caller
// belongs to the tenant, the line is one the tenant may use, there is a
// recipient, and this environment may send there.
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
import { resolveGreenApiChatTarget } from "../_shared/send-green-api-file-chat-resolve.mjs";

export type GreenFileSendDeps = {
  store: LineStore;
  /** The line used when the call names none (the chat screen). */
  legacyLine(tenantId: string, userId: string): Promise<SenderLine | null>;
  /** checkWhatsAppSend: Staging sends only to allowlisted phones. */
  guard(destination: string): GuardResult;
};

export type GreenFileSendInput = {
  tenantId: string;
  userId: string;
  integrationId: string | null;
  groupId: string | null;
  groupChatId: string | undefined;
  phoneNumber: string | null;
};

export type GreenFileSend =
  | { line: SenderLine; chatId: string; usedGroupChat: boolean }
  | { refusal: SendRefusal };

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
  // This function serves only signed-in users.
  const sender = await resolveSenderLine(
    deps.store,
    { ...input, caller: "user", type: "green_api" },
    () => deps.legacyLine(input.tenantId, input.userId),
  );
  if ("error" in sender) {
    return { refusal: lineRefusal(sender.error, "green_api") };
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
  const guard = deps.guard(
    usedGroupChat ? `group:${target.chatId}` : target.chatId,
  );
  if (guard.decision === "BLOCK") {
    console.warn("[send-green-api-file] blocked by integration-guard", guard);
    return { refusal: stagingRefusal(guard) };
  }
  return { line: sender.line, chatId: target.chatId, usedGroupChat };
}

/** A refusal with its HTTP status. */
function refuse(status: number, body: Record<string, unknown>): GreenFileSend {
  return { refusal: { status, body } };
}
