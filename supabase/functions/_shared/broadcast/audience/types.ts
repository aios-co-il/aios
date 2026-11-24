// Shared types for mailing audience resolution.
import type { Json } from "../../database.types.ts";
import type { DbClient } from "../../supabase-clients.ts";
import type { TemplateVars } from "../template/template-vars.ts";

/** What audience resolution needs from a client: tables and RPCs. */
export type AudienceDb = Pick<DbClient, "from" | "rpc">;

export type AudienceFilter = {
  source: "clients" | "leads" | "campaigners" | "list" | "wa_groups" | "manual";
  statuses?: Array<string>;
  statusMode?: "include" | "exclude";
  serviceTags?: Array<string>;
  statusKeys?: Array<string>;
  stageKeys?: Array<string>;
  stageMode?: "include" | "exclude";
  salesPersonIds?: Array<string>;
  agencyIds?: Array<string>;
  campaignerIds?: Array<string>;
  tagIds?: Array<string>;
  tagMode?: "include" | "exclude";
  roles?: Array<string>;
  activeOnly?: boolean;
  listId?: string;
  groupIds?: Array<string>;
  /** source = manual: typed email addresses / phone numbers */
  manualContacts?: Array<string>;
  includeIds?: Array<string>;
  excludeIds?: Array<string>;
};

export type Recipient = {
  entity_type: "client" | "lead" | "campaigner" | "manual" | "wa_group";
  entity_id: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  group_chat_id?: string | null;
  vars: TemplateVars;
};

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  paused: "מושהה",
  ended: "הסתיים",
  onboarding: "בקליטה",
  inactive: "לא פעיל",
};

/** Read a stored filter (broadcast_lists.source_config); null when it has no source. */
export function toAudienceFilter(value: Json | null): AudienceFilter | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.source !== "string" || !value.source) {
    return null;
  }
  return value as AudienceFilter;
}
