import { z } from "npm:zod@3.25.76";

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
const optionalTextSchema = z
  .union([z.string(), z.number().transform(String), z.nan().transform(String)])
  .optional()
  .catch(undefined);

/** `a || b || ""` over payload values, as text. */
export function firstText(...values: unknown[]): string {
  return optionalTextSchema.parse(values.find(Boolean)) ?? "";
}

const listSchema = z.array(z.unknown()).catch([]);

const payloadObjectSchema = z.record(z.unknown());

const metaEntrySchema = z
  .object({ changes: listSchema })
  .catch({ changes: [] });

const metaLeadgenChangeSchema = z.object({
  field: z.literal("leadgen"),
  value: z.unknown().refine(Boolean),
});

const metaLeadgenValueSchema = z
  .object({
    leadgen_id: optionalTextSchema,
    form_id: optionalTextSchema,
    ad_id: optionalTextSchema,
  })
  .catch({});

const leadItemSchema = z
  .object({
    id: z.unknown(),
    name: z.unknown(),
    full_name: z.unknown(),
    contact_name: z.unknown(),
    company_name: z.unknown(),
    company: z.unknown(),
    business_name: z.unknown(),
    email: z.unknown(),
    Email: z.unknown(),
    EMAIL: z.unknown(),
    phone: z.unknown(),
    Phone: z.unknown(),
    PHONE: z.unknown(),
    phone_number: z.unknown(),
    form_name: z.unknown(),
    form_id: z.unknown(),
    campaign_name: z.unknown(),
    campaign_id: z.unknown(),
    ad_name: z.unknown(),
    ad_id: z.unknown(),
    leadgen_id: z.unknown(),
  })
  .catch({});

const unifiedLeadSchema = z.object({
  name: z.unknown(),
  company_name: z.unknown(),
  company: z.unknown(),
  email: optionalTextSchema,
  phone: optionalTextSchema,
  emails: z
    .array(z.object({ email: optionalTextSchema }).catch({}))
    .optional()
    .catch(undefined),
  telephones: z
    .array(z.object({ telephone: optionalTextSchema }).catch({}))
    .optional()
    .catch(undefined),
});

export function extractLeads(rawBody: unknown): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Format 1: Unified.to webhook format (array of leads)
  if (Array.isArray(rawBody)) {
    for (const item of rawBody) {
      leads.push(parseLeadItem(item));
    }
    return leads;
  }

  const parsedBody = payloadObjectSchema.safeParse(rawBody);
  if (!parsedBody.success) return leads;
  const body = parsedBody.data;

  // Format 2: Unified.to single lead
  if (body.id && (body.emails || body.telephones || body.name)) {
    leads.push(parseUnifiedLead(rawBody));
    return leads;
  }

  // Format 3: Meta direct webhook format
  if (body.entry) {
    for (const entry of listSchema.parse(body.entry)) {
      for (const rawChange of metaEntrySchema.parse(entry).changes) {
        const change = metaLeadgenChangeSchema.safeParse(rawChange);
        if (!change.success) continue;
        const value = metaLeadgenValueSchema.parse(change.data.value);
        leads.push({
          leadgen_id: value.leadgen_id,
          form_name: value.form_id,
          campaign_name: value.ad_id,
          raw: change.data.value,
        });
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
    leads.push(parseLeadItem(rawBody));
    return leads;
  }

  // Format 6: Wrapped in 'lead' key
  if (body.lead) {
    leads.push(parseLeadItem(body.lead));
    return leads;
  }

  return leads;
}

export function parseUnifiedLead(rawItem: unknown): ParsedLead {
  const item = unifiedLeadSchema.catch({}).parse(rawItem);
  return {
    name: firstText(item.name, item.company_name),
    contact_name: firstText(item.name),
    email: item.emails ? item.emails[0]?.email : item.email,
    phone: item.telephones ? item.telephones[0]?.telephone : item.phone,
    company_name: firstText(item.company_name, item.company),
    raw: rawItem,
  };
}

export function parseLeadItem(rawItem: unknown): ParsedLead {
  const item = leadItemSchema.parse(rawItem);
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
