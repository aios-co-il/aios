import type { Tables } from "../../_shared/database.types.ts";

export type ChatScopeMode = "full" | "group" | "staff" | "none";

export interface ChatScopeInput {
  tenantId: string;
  accessibleTenantIds: string[];
  /**
   * The verified caller's user id (JWT user or the sender's profile). Their
   * role and managed agencies are looked up for this tenant only.
   */
  userId: string | null;
  /**
   * The caller's campaigner record, if any (on WhatsApp: the sender's active
   * record in this tenant). Counts as a campaigner when no role is found.
   */
  callerCampaignerId: string | null;
  /** Set by service callers only (Carmen's WhatsApp webhook, automations). */
  waNotify?: {
    chat_id?: unknown;
    is_group?: unknown;
    connection_user_id?: unknown;
  } | null;
  /** YYYY-MM-DD in Israel time; defaults to today. Tests pass it. */
  today?: string;
}

export interface LeadScope {
  all: boolean;
  agencyIds: string[];
  salesPersonId: string | null;
}

export interface ChatScope {
  mode: ChatScopeMode;
  /** Why nothing is visible (mode "none"), for Carmen to relay. */
  reason: string | null;
  /** Mode "group": the current group's whatsapp_groups.id. */
  groupId: string | null;
  /** green_api rows only from these connection owners (all modes but full). */
  connectionUserIds: string[];
  /** Mode "staff": "all" = every client of the tenant, else these ids. */
  clientIds: "all" | string[];
  leads: LeadScope;
  /** Mode "staff": WhatsApp groups linked to the in-scope clients. */
  linkedGroupIds: string[];
  /** Mode "staff" on a private WhatsApp turn: the caller's own chat with Carmen. */
  ownThread: { phoneTail: string; connectionUserId: string | null } | null;
}

export interface ChatScopeRow {
  client_id?: string | null;
  lead_id?: string | null;
  group_id?: string | null;
  provider?: string | null;
  connection_user_id?: string | null;
  sender_phone?: string | null;
}

export interface LeadOwner {
  agency_id: string | null;
  sales_person_id: string | null;
}

export type ChatScopeFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "neq"; column: string; value: string }
  | { op: "is"; column: string; value: null }
  | { op: "or"; value: string };

/** A get_chat_history row: the columns it returns plus the scope columns. */
export type ChatHistoryRow = ChatScopeRow &
  Pick<
    Tables<"chat_messages">,
    "id" | "message_text" | "direction" | "sender_name" | "created_at"
  >;

/** A get_recent_inbound_messages row with its client and lead embeds. */
export type InboundChatRow = ChatScopeRow &
  Pick<
    Tables<"chat_messages">,
    "id" | "message_text" | "sender_name" | "sender_phone" | "created_at"
  > & {
    clients: { name: string | null } | null;
    leads: { company_name: string | null } | null;
  };
