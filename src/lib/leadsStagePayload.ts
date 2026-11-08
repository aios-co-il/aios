import { z } from "zod";
import { isJson } from "./json";
import { Constants } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";
import type {
  LeadRelationsRow,
  LeadsKanbanCache,
  LeadsPageLead,
} from "../types/leadsPage.ts";

/** Scalars every stage RPC row must provide before it enters the lead-page cache. */
export const leadsPageLeadSchema: z.ZodType<LeadsPageLead> = z.object({
  id: z.string(),
  tenant_id: z.string().nullable(),
  contact_name: z.string().nullable(),
  company_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: z.string(),
  response_status: z.string().nullable(),
  source: z.string(),
  campaign_name: z.string().nullable(),
  industry: z.string().nullable(),
  estimated_deal_value: z.number().nullable(),
  folder_link: z.string().nullable(),
  notes: z.string().nullable(),
  agency_id: z.string().nullable(),
  sales_person_id: z.string().nullable(),
  follow_up_date: z.string().nullable(),
  won_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullish(),
  archived_by: z.string().nullish(),
  client_id: z.string().nullish(),
  closing_date: z.string().nullish(),
  facebook_form_id: z.string().nullish(),
  facebook_leadgen_id: z.string().nullish(),
  first_created_at: z.string().nullish(),
  first_source: z.string().nullish(),
  form_qa_summary: z.string().nullish(),
  general_status: z.string().nullish(),
  itai_meeting_date: z.string().nullish(),
  lost_reason: z.string().nullish(),
  manychat_subscriber_id: z.string().nullish(),
  meeting_date: z.string().nullish(),
  meeting_location: z.string().nullish(),
  meeting_reminder_day_after_sent_at: z.string().nullish(),
  meeting_reminder_same_day_sent_at: z.string().nullish(),
  meeting_set_date: z.string().nullish(),
  meeting_time: z.string().nullish(),
  products: z.string().nullish(),
  proposal_date: z.string().nullish(),
  proposal_sent_date: z.string().nullish(),
  sale_date: z.string().nullish(),
  whatsapp_avatar_url: z.string().nullish(),
  monthly_budget: z.number().nullish(),
  three_month_budget: z.number().nullish(),
  active_chat_provider: z.enum(Constants.public.Enums.chat_provider).nullish(),
  attachments: z.custom<Json>(isJson).optional(),
  folder_links: z.custom<Json>(isJson).optional(),
  form_data: z.custom<Json>(isJson).optional(),
  agencies: z.object({ name: z.string().nullable() }).nullish(),
  sales_people: z.object({ full_name: z.string().nullable() }).nullish(),
});

const stageLeadListSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = leadsPageLeadSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

const stageBucketSchema = z
  .object({
    stage: z.unknown(),
    leads: stageLeadListSchema,
    total_count: z.number().catch(0),
  })
  .catch({ stage: undefined, leads: [], total_count: 0 });

type StageBucketPayload = z.infer<typeof stageBucketSchema>;

/** Each `[stage key, stage payload]` of a get_leads_by_stages result (array or object form). */
const stagePayloadSchema = z
  .union([
    z
      .array(stageBucketSchema)
      .transform((stages) =>
        stages.map((stage): [string, StageBucketPayload] => [
          String(stage.stage),
          stage,
        ]),
      ),
    z.record(stageBucketSchema).transform((stages) => Object.entries(stages)),
  ])
  .catch([]);

const stageEntries = (data: unknown) => stagePayloadSchema.parse(data);

/** Validate stage RPC rows before placing them in the kanban cache. */
export function parseStageBuckets(data: unknown): LeadsKanbanCache {
  const stageMap: LeadsKanbanCache = {};
  for (const [stageKey, stageData] of stageEntries(data)) {
    stageMap[stageKey] = {
      leads: stageData.leads,
      totalCount: stageData.total_count || 0,
    };
  }
  return stageMap;
}

/** Read supported numeric counts from stage RPC buckets. */
export function parseStageCounts(data: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [stageKey, stageData] of stageEntries(data)) {
    counts[stageKey] = stageData.total_count || 0;
  }
  return counts;
}

/** The leads of one stage in a get_leads_by_stages result. */
export function stageLeadsFromPayload(
  data: unknown,
  stageId: string,
): LeadsPageLead[] {
  return (
    stageEntries(data).find(([stageKey]) => stageKey === stageId)?.[1].leads ??
    []
  );
}

/** Overlay campaign, source, response status, agency and sales person from a relations query. */
export function mergeLeadRelations(
  leads: LeadsPageLead[],
  relations: LeadRelationsRow[] | null,
): LeadsPageLead[] {
  const relationsMap: Record<string, LeadRelationsRow> = {};
  for (const rel of relations || []) relationsMap[rel.id] = rel;
  return leads.map((lead) => ({
    ...lead,
    campaign_name:
      relationsMap[lead.id]?.campaign_name ?? lead.campaign_name ?? null,
    source: relationsMap[lead.id]?.source ?? lead.source,
    response_status:
      relationsMap[lead.id]?.response_status ?? lead.response_status,
    agencies: relationsMap[lead.id]?.agencies || null,
    sales_people: relationsMap[lead.id]?.sales_people || null,
  }));
}

/** Move a lead into `newStatus` across the kanban cache buckets (optimistic drag). */
export function moveLeadInKanbanCache(
  old: LeadsKanbanCache | undefined,
  leadId: string,
  newStatus: string,
): LeadsKanbanCache | undefined {
  if (!old || typeof old !== "object") return old;
  const updated: LeadsKanbanCache = { ...old };
  let movedLead: LeadsPageLead | null = null;
  for (const stageKey in updated) {
    const bucket = updated[stageKey];
    if (!bucket?.leads || !Array.isArray(bucket.leads)) continue;
    const idx = bucket.leads.findIndex((l) => l.id === leadId);
    if (idx === -1) continue;
    movedLead = { ...bucket.leads[idx], status: newStatus };
    updated[stageKey] = {
      ...bucket,
      leads: [...bucket.leads.slice(0, idx), ...bucket.leads.slice(idx + 1)],
      totalCount: Math.max(0, (bucket.totalCount || 1) - 1),
    };
    break;
  }
  if (movedLead) {
    const target = updated[newStatus];
    updated[newStatus] = target?.leads
      ? {
          ...target,
          leads: [movedLead, ...target.leads],
          totalCount: (target.totalCount || 0) + 1,
        }
      : { leads: [movedLead], totalCount: 1 };
  }
  return updated;
}

/** Apply `patch` to one lead in every kanban cache bucket. */
export function patchLeadInKanbanCache(
  old: LeadsKanbanCache | undefined,
  leadId: string,
  patch: Partial<LeadsPageLead>,
): LeadsKanbanCache | undefined {
  if (!old) return old;
  const updated: LeadsKanbanCache = { ...old };
  for (const stageKey in updated) {
    const bucket = updated[stageKey];
    if (!bucket?.leads || !Array.isArray(bucket.leads)) continue;
    updated[stageKey] = {
      ...bucket,
      leads: bucket.leads.map((l) =>
        l.id === leadId ? { ...l, ...patch } : l,
      ),
    };
  }
  return updated;
}
