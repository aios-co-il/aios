import type { ToolWhatsAppNotify } from "../tool-context.ts";
import type { CarmenWaNotify } from "../../_shared/carmen-session-identity.ts";

/** Only a complete delivery target may be persisted for a background task. */
export function subagentNotify(
  notify: ToolWhatsAppNotify | null | undefined,
): CarmenWaNotify | null {
  if (!notify || notify.surface !== "whatsapp") {
    return null;
  }
  const {
    tenant_id,
    automation_id,
    connection_user_id,
    chat_id,
    phone_number,
    is_group,
  } = notify;
  if (
    typeof tenant_id !== "string" ||
    !tenant_id ||
    typeof chat_id !== "string" ||
    !chat_id ||
    typeof is_group !== "boolean" ||
    !(typeof automation_id === "string" || automation_id === null) ||
    !(typeof connection_user_id === "string" || connection_user_id === null) ||
    !(typeof phone_number === "string" || phone_number === null)
  ) {
    console.warn("[subagent] incomplete WhatsApp delivery target");
    return null;
  }
  return {
    surface: "whatsapp",
    tenant_id,
    automation_id,
    connection_user_id,
    chat_id,
    phone_number,
    is_group,
  };
}
