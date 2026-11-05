import { type ArtifactInput, artifactRow } from "./artifacts.ts";
import { type Db } from "./db.ts";

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The creative stage runs are filed under: the client's, or the tenant's "no client" pipeline. */
export async function creativeStageFor(
  supabase: Db,
  tenantId: string,
  clientId: string | null,
): Promise<{ pipelineId: string; stageId: string }> {
  const { data, error } = await supabase.rpc("workshop_creative_stage", {
    p_tenant_id: tenantId,
    p_client_id: clientId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    { pipeline_id?: string; stage_id?: string } | null | undefined;
  if (!row?.pipeline_id || !row?.stage_id)
    throw new Error("שלב הקריאייטיב לא נמצא בפייפליין");
  return { pipelineId: row.pipeline_id, stageId: row.stage_id };
}

export async function recordArtifact(supabase: Db, input: ArtifactInput) {
  const { data, error } = await supabase
    .from("workshop_artifacts")
    .insert(artifactRow(input))
    .select("id, kind, title, folder, status, url, thumb_url")
    .single();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    kind: string;
    title: string;
    folder: string;
    status: string;
    url: string | null;
    thumb_url: string | null;
  };
}
