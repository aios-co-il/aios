import { loadStaffWhatsappRoster } from "./staff-whatsapp-roster.ts";
import type { SendMessageToCampaignerArgs } from "./messaging-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { selectStaffMatch } from "../../_shared/staff-whatsapp.ts";
import { formatStaffContact } from "../../_shared/staff-whatsapp.ts";
import { sendStaffWhatsappMessage } from "../staff-alert-tool.ts";

/** Preserves the existing send_message_to_campaigner executor and side-effect order. */
export async function executeSendMessageToCampaigner(
  args: SendMessageToCampaignerArgs & {
    message?: string;
    entity_type?: string;
    staff_id?: string;
  },
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    agentId,
    conversationId,
    actorUserId,
    accessibleTenantIds,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    name,
  } = context;

  const message = String(args.message || args.message_text || "").trim();
  if (!message) {
    return { error: "message / message_text נדרש" };
  }

  const entityType =
    name === "send_message_to_campaigner"
      ? "campaigner"
      : args.entity_type || "auto";
  const staffId = args.staff_id || args.campaigner_id || null;
  const staffName = args.name || null;
  if (!staffId && !staffName) {
    return {
      error:
        "נדרש staff_id/campaigner_id או name. אפשר קודם lookup_staff_whatsapp / list_campaigners.",
    };
  }

  const roster = await loadStaffWhatsappRoster(
    supabase,
    accessibleTenantIds,
    tenantId,
    entityType,
  );
  const picked = selectStaffMatch(roster, {
    id: staffId as null,
    name: staffName as null,
    entityType,
  });
  if (picked.ambiguous?.length) {
    return {
      ambiguous: true,
      matches: picked.ambiguous.map(formatStaffContact),
      message: "נמצאו כמה אנשי צוות — צייני staff_id או entity_type מדויק",
    };
  }
  if (!picked.match) {
    return {
      error: staffId
        ? "איש צוות לא נמצא לפי id"
        : `לא נמצא איש צוות בשם "${staffName}"`,
    };
  }
  const contact = formatStaffContact(picked.match);
  if (!contact?.phone) {
    return {
      error: `לא נמצא מספר טלפון עבור ${contact?.full_name || "איש הצוות"} במערכת`,
    };
  }

  const sendResult = await sendStaffWhatsappMessage({
    supabase,
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    tenantId,
    phone: contact.phone,
    message,
    requesterUserId: actorUserId,
    agentId: agentId || null,
    conversationId: conversationId || null,
    recipient: contact,
  });
  if (sendResult.error) {
    return sendResult;
  }
  return {
    success: true,
    entity_type: contact.entity_type,
    staff_id: contact.id,
    staff_name: contact.full_name,
    phone: contact.phone,
    ...sendResult,
  };
}
