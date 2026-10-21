// Labels and names used to fill merge fields; loaded once per resolution.
import type { DbClient } from "../../supabase-clients.ts";
import { fetchByIds, todayIso } from "./query.ts";

type Names = Map<string, string | null>;

export type Lookups = {
  stages: Names;
  statuses: Names;
  agencies: Names;
  salesPeople: Names;
  campaigners: Names;
  clientCampaigner: Map<string, string>; // client_id → campaigner name
};

/** Lookup that tolerates a null / missing key. */
export const lookup = (m: Names, key: string | null | undefined) =>
  key == null ? undefined : m.get(key);

const toMap = <T>(
  rows: T[] | null,
  key: (r: T) => string,
  val: (r: T) => string | null,
): Names => new Map((rows || []).map((r) => [key(r), val(r)]));

export async function loadLookups(
  db: DbClient,
  tenantId: string,
  clientIds: string[],
): Promise<Lookups> {
  const [stages, statuses, agencies, salesPeople, campaigners] =
    await Promise.all([
      db
        .from("lead_pipeline_stages")
        .select("stage_key, label")
        .eq("tenant_id", tenantId),
      db
        .from("lead_statuses")
        .select("status_key, label")
        .eq("tenant_id", tenantId),
      db.from("agencies").select("id, name").eq("tenant_id", tenantId),
      db.from("sales_people").select("id, full_name").eq("tenant_id", tenantId),
      db.from("campaigners").select("id, full_name").eq("tenant_id", tenantId),
    ]);
  const campaignerNames = toMap(
    campaigners.data,
    (c) => c.id,
    (c) => c.full_name,
  );
  const clientCampaigner = new Map<string, string>();
  if (clientIds.length > 0) {
    const team = await fetchByIds(clientIds, (chunk) =>
      db
        .from("client_team")
        .select("client_id, campaigner_id, end_date")
        .in("client_id", chunk),
    );
    const today = todayIso();
    for (const t of team) {
      if (t.end_date && t.end_date < today) continue;
      const name = campaignerNames.get(t.campaigner_id);
      if (!name) continue;
      const prev = clientCampaigner.get(t.client_id);
      clientCampaigner.set(t.client_id, prev ? `${prev}, ${name}` : name);
    }
  }
  return {
    stages: toMap(
      stages.data,
      (s) => s.stage_key,
      (s) => s.label,
    ),
    statuses: toMap(
      statuses.data,
      (s) => s.status_key,
      (s) => s.label,
    ),
    agencies: toMap(
      agencies.data,
      (a) => a.id,
      (a) => a.name,
    ),
    salesPeople: toMap(
      salesPeople.data,
      (s) => s.id,
      (s) => s.full_name,
    ),
    campaigners: campaignerNames,
    clientCampaigner,
  };
}
