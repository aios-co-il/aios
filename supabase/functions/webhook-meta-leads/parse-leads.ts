import { asObject, type UnknownObject } from "../_shared/lead-json.ts";

export interface ParsedLead {
  name?: string;
  company_name?: string;
  contact_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  form_name?: string;
  campaign_name?: string;
  ad_name?: string;
  leadgen_id?: string;
  raw?: unknown;
}

/** Payload text: strings as-is, numbers stringified, anything else absent. */
export function optionalText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : undefined;
}

/** `a || b || ""` over payload values, as text. */
export function firstText(...values: unknown[]): string {
  return optionalText(values.find(Boolean)) ?? "";
}

const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export function extractLeads(rawBody: unknown): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Format 1: Unified.to webhook format (array of leads)
  if (Array.isArray(rawBody)) {
    for (const item of rawBody) {
      leads.push(parseLeadItem(item));
    }
    return leads;
  }

  const body = asObject(rawBody);
  if (!body) return leads;

  // Format 2: Unified.to single lead
  if (body.id && (body.emails || body.telephones || body.name)) {
    leads.push(parseUnifiedLead(body));
    return leads;
  }

  // Format 3: Meta direct webhook format
  if (body.entry) {
    for (const entry of asList(body.entry)) {
      for (const rawChange of asList(asObject(entry)?.changes)) {
        const change = asObject(rawChange);
        if (change?.field === "leadgen" && change.value) {
          const value = asObject(change.value);
          leads.push({
            leadgen_id: optionalText(value?.leadgen_id),
            form_name: optionalText(value?.form_id),
            campaign_name: optionalText(value?.ad_id),
            raw: change.value,
          });
        }
      }
    }
    return leads;
  }

  // Format 4: Make.com / generic format
  if (body.data && Array.isArray(body.data)) {
    for (const item of body.data) {
      leads.push(parseLeadItem(item));
    }
    return leads;
  }

  // Format 5: Single lead object
  if (body.email || body.phone || body.name || body.contact_name) {
    leads.push(parseLeadItem(body));
    return leads;
  }

  // Format 6: Wrapped in 'lead' key
  if (body.lead) {
    leads.push(parseLeadItem(body.lead));
    return leads;
  }

  return leads;
}

export function parseUnifiedLead(item: UnknownObject): ParsedLead {
  return {
    name: firstText(item.name, item.company_name),
    contact_name: firstText(item.name),
    email: Array.isArray(item.emails)
      ? optionalText(asObject(item.emails[0])?.email)
      : optionalText(item.email),
    phone: Array.isArray(item.telephones)
      ? optionalText(asObject(item.telephones[0])?.telephone)
      : optionalText(item.phone),
    company_name: firstText(item.company_name, item.company),
    raw: item,
  };
}

export function parseLeadItem(rawItem: unknown): ParsedLead {
  const item: UnknownObject = asObject(rawItem) ?? {};
  return {
    name: firstText(item.name, item.company_name, item.full_name),
    contact_name: firstText(item.contact_name, item.full_name, item.name),
    full_name: firstText(item.full_name, item.name),
    email: firstText(item.email, item.Email, item.EMAIL),
    phone: firstText(item.phone, item.Phone, item.PHONE, item.phone_number),
    company_name: firstText(
      item.company_name,
      item.company,
      item.business_name,
    ),
    form_name: firstText(item.form_name, item.form_id),
    campaign_name: firstText(item.campaign_name, item.campaign_id),
    ad_name: firstText(item.ad_name, item.ad_id),
    leadgen_id: firstText(item.leadgen_id, item.id),
    raw: rawItem,
  };
}

export function buildLeadNotes(lead: ParsedLead): string {
  const parts: string[] = ["מקור: Meta Lead Ads"];
  if (lead.form_name) parts.push(`טופס: ${lead.form_name}`);
  if (lead.campaign_name) parts.push(`קמפיין: ${lead.campaign_name}`);
  if (lead.ad_name) parts.push(`מודעה: ${lead.ad_name}`);
  if (lead.leadgen_id) parts.push(`leadgen_id: ${lead.leadgen_id}`);
  return parts.join("\n");
}
