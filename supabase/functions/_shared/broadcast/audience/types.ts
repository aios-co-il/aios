// Shared types for mailing audience resolution.
import type { Json } from "../../database.types.ts";
import type { TemplateVars } from "../template/template-vars.ts";

export type AudienceFilter = {
  source: "clients" | "leads" | "campaigners" | "list" | "wa_groups";
  statuses?: string[];
  statusMode?: "include" | "exclude";
  serviceTags?: string[];
  statusKeys?: string[];
  stageKeys?: string[];
  stageMode?: "include" | "exclude";
  salesPersonIds?: string[];
  agencyIds?: string[];
  campaignerIds?: string[];
  tagIds?: string[];
  tagMode?: "include" | "exclude";
  roles?: string[];
  activeOnly?: boolean;
  listId?: string;
  groupIds?: string[];
  includeIds?: string[];
  excludeIds?: string[];
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.source !== "string" || !value.source) return null;
  return value as AudienceFilter;
}
