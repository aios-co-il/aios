// Lead / client rows → recipients with their merge-field vars.
import type { Tables } from "../../database.types.ts";
import { buildTemplateVars } from "../template/template-vars.ts";
import { loadLookups, lookup, type Lookups } from "./lookups.ts";
import { flatObject } from "./query.ts";
import {
  type AudienceDb,
  CLIENT_STATUS_LABELS,
  type Recipient,
} from "./types.ts";

export const LEAD_COLUMNS =
  "id, contact_name, company_name, phone, email, status, response_status, sales_person_id, agency_id, form_data" as const;
export const CLIENT_COLUMNS =
  "id, contact_name, name, phone, email, status, services, agency_id" as const;

export type LeadRow = Pick<
  Tables<"leads">,
  | "id"
  | "contact_name"
  | "company_name"
  | "phone"
  | "email"
  | "status"
  | "response_status"
  | "sales_person_id"
  | "agency_id"
  | "form_data"
>;
export type ClientRow = Pick<
  Tables<"clients">,
  | "id"
  | "contact_name"
  | "name"
  | "phone"
  | "email"
  | "status"
  | "services"
  | "agency_id"
>;

export function leadRecipient(
  l: LeadRow,
  lk: Lookups,
  extra: Record<string, unknown> = {},
): Recipient {
  return {
    entity_type: "lead",
    entity_id: l.id,
    phone: l.phone || null,
    email: l.email || null,
    contact_name: l.contact_name || l.company_name || null,
    vars: buildTemplateVars({
      contact_name: l.contact_name,
      company_name: l.company_name,
      email: l.email,
      phone: l.phone,
      agency_name: lookup(lk.agencies, l.agency_id),
      sales_person_name: lookup(lk.salesPeople, l.sales_person_id),
      lead_stage: lookup(lk.stages, l.status) ?? l.status,
      lead_status: lookup(lk.statuses, l.response_status) ?? l.response_status,
      extra: { ...flatObject(l.form_data), ...extra },
    }),
  };
}

export function clientRecipient(
  c: ClientRow,
  lk: Lookups,
  extra: Record<string, unknown> = {},
): Recipient {
  return {
    entity_type: "client",
    entity_id: c.id,
    phone: c.phone || null,
    email: c.email || null,
    contact_name: c.contact_name || c.name || null,
    vars: buildTemplateVars({
      contact_name: c.contact_name || c.name,
      company_name: c.name,
      email: c.email,
      phone: c.phone,
      agency_name: lookup(lk.agencies, c.agency_id),
      campaigner_name: lk.clientCampaigner.get(c.id),
      client_status: CLIENT_STATUS_LABELS[c.status] ?? c.status,
      extra,
    }),
  };
}

/** Build recipient vars for a single lead / client (automation triggers). */
export async function recipientForEntity(
  db: AudienceDb,
  tenantId: string,
  entityType: "lead" | "client",
  entityId: string,
): Promise<Recipient | null> {
  if (entityType === "lead") {
    const { data, error } = await db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", entityId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return leadRecipient(data, await loadLookups(db, tenantId, []));
  }
  const { data, error } = await db
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return clientRecipient(data, await loadLookups(db, tenantId, [entityId]));
}
