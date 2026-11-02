import type { Db } from "./workshop/db.ts";

export type MarketingTrack = "campaigns" | "seo_geo" | "social_organic";

/**
 * A client's pipeline of one track, created when the client has none. A client can have
 * duplicates, so this takes the oldest one, as ensurePipelineForClient
 * (src/components/marketing/lib/ensurePipeline.ts) and public.workshop_department_stage do.
 * A failed lookup is returned as an error and creates nothing: read as "no pipeline", it would
 * add the duplicate AIO-256 sets out to stop. A failed insert throws.
 */
export async function findOrCreateClientPipeline(
  db: Db,
  input: { clientId: string; tenantId: string; track: MarketingTrack },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await db
    .from("marketing_pipelines")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("track", input.track)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  if (error) {
    return {
      error: `לא הצלחנו לקרוא את תהליך העבודה של הלקוח: ${error.message}`,
    };
  }
  const oldest = data?.[0];
  if (oldest) return { id: oldest.id };
  const { data: created, error: insertError } = await db
    .from("marketing_pipelines")
    .insert({
      client_id: input.clientId,
      tenant_id: input.tenantId,
      track: input.track,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return { id: created.id };
}
