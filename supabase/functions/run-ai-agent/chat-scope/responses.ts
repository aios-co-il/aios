import type { DbClient } from "../../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { hasLeadAccess, leadInScope } from "./leads.ts";
import type { ChatScope, LeadOwner } from "./types.ts";

export const CHAT_SCOPE_NOTES = {
  notStaff:
    "קריאת צ׳אטים זמינה רק לאנשי צוות מזוהים. אל תחשפי תוכן משיחות אחרות.",
  groupNotFound:
    "הקבוצה הנוכחית לא נמצאה, ולכן אין כאן גישה להיסטוריית צ׳אטים.",
  group: "בקבוצה אפשר לקרוא רק את ההודעות של הקבוצה הזו.",
  staff: "מוצגים רק צ׳אטים של לקוחות ולידים שבאחריותך.",
  staffWithOwnChat:
    "מוצגים רק צ׳אטים של לקוחות ולידים שבאחריותך, והשיחה הפרטית שלך איתי.",
  clientOutOfScope: "הלקוח הזה לא משויך אליך, ולכן אין לך גישה לצ׳אטים שלו.",
  leadOutOfScope: "הליד הזה לא באחריותך, ולכן אין לך גישה לצ׳אטים שלו.",
};

/**
 * What a chat reader returns instead of reading: the refusal of a "none"
 * scope, or of a contact outside a staff scope. null to go ahead.
 */
export async function chatReadRefusal(
  supabase: Pick<DbClient, "from">,
  scope: ChatScope,
  contact: { type: unknown; id: unknown } | null,
  tenantIds: string[],
): Promise<Record<string, unknown> | null> {
  if (scope.mode === "none") {
    return chatScopeRefusal(scope);
  }

  return contact
    ? chatContactRefusal(supabase, scope, contact.type, contact.id, tenantIds)
    : null;
}

/** What a chat tool returns when the caller may read nothing. */
export function chatScopeRefusal(scope: ChatScope) {
  return {
    count: 0,
    messages: [],
    access_scope: "none",
    note: scope.reason || CHAT_SCOPE_NOTES.notStaff,
  };
}

/** Extra result fields that tell Carmen her view was narrowed. */
export function chatScopeMeta(scope: ChatScope): Record<string, string> {
  if (scope.mode === "group") {
    return { access_scope: "group", access_note: CHAT_SCOPE_NOTES.group };
  }

  if (scope.mode === "staff") {
    return {
      access_scope: "staff",
      access_note: scope.ownThread
        ? CHAT_SCOPE_NOTES.staffWithOwnChat
        : CHAT_SCOPE_NOTES.staff,
    };
  }

  return {};
}

/**
 * get_chat_history asks for one contact by id. Returns a refusal when the
 * contact is outside a staff caller's scope, or null to go ahead.
 */
export async function chatContactRefusal(
  supabase: Pick<DbClient, "from">,
  scope: ChatScope,
  contactType: unknown,
  contactId: unknown,
  tenantIds: string[],
): Promise<Record<string, unknown> | null> {
  if (scope.mode !== "staff") {
    return null;
  }

  const id = asUuidOrNull(contactId);
  if (contactType === "client") {
    if (scope.clientIds === "all") {
      return null;
    }

    return id && scope.clientIds.includes(id.toLowerCase())
      ? null
      : accessDenied(CHAT_SCOPE_NOTES.clientOutOfScope);
  }

  if (scope.leads.all) {
    return null;
  }

  if (!id || !hasLeadAccess(scope.leads)) {
    return accessDenied(CHAT_SCOPE_NOTES.leadOutOfScope);
  }

  return leadInScope(await leadOwnerFor(supabase, id, tenantIds), scope.leads)
    ? null
    : accessDenied(CHAT_SCOPE_NOTES.leadOutOfScope);
}

/** A staff caller's refusal for a contact outside their scope. */
function accessDenied(note: string) {
  return {
    count: 0,
    messages: [],
    error: "access_denied",
    access_scope: "staff",
    note,
  };
}

/** The lead's agency and salesperson in these tenants; throws on a DB error. */
async function leadOwnerFor(
  supabase: Pick<DbClient, "from">,
  leadId: string,
  tenantIds: string[],
): Promise<LeadOwner | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("agency_id, sales_person_id")
    .eq("id", leadId)
    .in("tenant_id", tenantIds)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return data;
}
