// Who a Manus file goes to: a group's chat id, or a phone number.
import type { DbClient } from "../_shared/supabase-clients.ts";
import { toGatewayPhone } from "../_shared/telephony/phone.ts";

export type ManusTarget = { to: string; isGroup: boolean };

export type ManusTargetError =
  "missing_recipient" | "invalid_phone" | "missing_group_chat_id";

/**
 * The gateway recipient: the group's chat id when the group resolved, else
 * the phone number (a report may name both, the phone as a fallback). Never
 * a bare country code: an empty phone used to send to "972".
 */
export function manusTarget(input: {
  groupId: string | null;
  groupChatId: string | null;
  phoneNumber: string | null;
  countryCode: string | null;
}): ManusTarget | { error: ManusTargetError } {
  if (input.groupChatId) {
    return { to: input.groupChatId, isGroup: true };
  }
  const digits = (input.phoneNumber || "").replace(/\D/g, "");
  if (!digits) {
    return {
      error: input.groupId ? "missing_group_chat_id" : "missing_recipient",
    };
  }
  const cc = /^\d{1,3}$/.test(input.countryCode || "")
    ? input.countryCode
    : null;
  const phone = toGatewayPhone(digits, cc || "972");
  return /^\d{10,15}$/.test(phone)
    ? { to: phone, isGroup: false }
    : { error: "invalid_phone" };
}

/** The group's WhatsApp chat id, only from the sending tenant's groups. */
export async function findGroupChatId(
  admin: DbClient,
  tenantId: string,
  groupId: string | null,
): Promise<string | null> {
  if (!groupId) {
    return null;
  }
  const { data, error } = await admin
    .from("whatsapp_groups")
    .select("group_chat_id")
    .eq("id", groupId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  const chatId = data?.group_chat_id || "";
  return chatId.endsWith("@g.us") ? chatId : null;
}
