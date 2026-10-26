import type {
  LeadRelationsRow,
  LeadsKanbanCache,
  LeadsPageLead,
} from "../types/crm-b14.ts";

/** A JSON row the page treats as a lead: an object with a string id. */
export function isLeadsPageLead(value: unknown): value is LeadsPageLead {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.entries(value).find(([k]) => k === key)?.[1];
}

function stageLeads(stageData: unknown): LeadsPageLead[] {
  const leads = field(stageData, "leads");
  return Array.isArray(leads) ? leads.filter(isLeadsPageLead) : [];
}

function stageTotal(stageData: unknown): number {
  const total = field(stageData, "total_count");
  return typeof total === "number" ? total || 0 : 0;
}

/** Each `[stage key, stage payload]` of a get_leads_by_stages result (array or object form). */
function stageEntries(data: unknown): Array<[string, unknown]> {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map((stageData) => [
      String(field(stageData, "stage")),
      stageData,
    ]);
  }
  if (typeof data === "object") return Object.entries(data);
  return [];
}

export function parseStageBuckets(data: unknown): LeadsKanbanCache {
  const stageMap: LeadsKanbanCache = {};
  for (const [stageKey, stageData] of stageEntries(data)) {
    stageMap[stageKey] = {
      leads: stageLeads(stageData),
      totalCount: stageTotal(stageData),
    };
  }
  return stageMap;
}

export function parseStageCounts(data: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [stageKey, stageData] of stageEntries(data)) {
    counts[stageKey] = stageTotal(stageData);
  }
  return counts;
}

/** The leads of one stage in a get_leads_by_stages result. */
export function stageLeadsFromPayload(
  data: unknown,
  stageId: string,
): LeadsPageLead[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return stageLeads(data.find((item) => field(item, "stage") === stageId));
  }
  return stageLeads(field(data, stageId));
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
