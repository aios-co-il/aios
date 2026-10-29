import { artifactRow } from "./artifacts.ts";
import { type Db } from "./db.ts";
import { asRecord, recordArtifact } from "./record.ts";
import { PAGE_COLUMNS } from "./scene-helpers.ts";

export async function openPlaceholders(
  supabase: Db,
  tenantId: string,
  itemId: string,
  rows: { kind: "image" | "scene_still"; title: string; meta?: object }[],
): Promise<(string | undefined)[]> {
  const none = rows.map(() => undefined);
  try {
    await supabase
      .from("workshop_artifacts")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("status", "pending")
      .eq("meta->>placeholder", "true");
    const { data, error } = await supabase
      .from("workshop_artifacts")
      .insert(
        rows.map((row) =>
          artifactRow({
            tenantId,
            itemId,
            kind: row.kind,
            title: row.title,
            status: "pending",
            meta: { ...row.meta, placeholder: true },
          }),
        ),
      )
      .select("id");
    if (error || !Array.isArray(data)) return none;
    return rows.map((_, index) => data[index]?.id);
  } catch {
    return none;
  }
}

export async function settlePlaceholder(
  supabase: Db,
  tenantId: string,
  id: string | undefined,
  patch: Record<string, unknown>,
) {
  if (!id) return null;
  try {
    const { data } = await supabase
      .from("workshop_artifacts")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(PAGE_COLUMNS)
      .maybeSingle();
    return (data ?? null) as Record<string, any> | null;
  } catch {
    return null;
  }
}

export const failedPatch = (error: string) => ({
  status: "failed",
  meta: { text: error.slice(0, 300) },
});

/**
 * A scene picture always gets its page on the board. The database trigger usually does it; this
 * covers projects it skips and keeps the board right if the trigger ever fails.
 */
export async function ensureStillPage(
  supabase: Db,
  tenantId: string,
  itemId: string,
  scene: Record<string, any>,
  asset: unknown,
  url: string,
  placeholderId?: string,
) {
  const assetId = asRecord(Array.isArray(asset) ? asset[0] : asset).id;
  if (typeof assetId !== "string") return;
  const { data: existing } = await supabase
    .from("workshop_artifacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("ref_table", "marketing_assets")
    .eq("ref_id", assetId)
    .maybeSingle();
  if (existing) return;
  const settled = await settlePlaceholder(supabase, tenantId, placeholderId, {
    status: "ready",
    url,
    thumb_url: url,
    ref_table: "marketing_assets",
    ref_id: assetId,
    meta: { asset_id: assetId },
  });
  if (settled) return;
  await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "scene_still",
    title: `סצנה ${scene.position}${scene.title ? ` · ${scene.title}` : ""}`,
    url,
    refTable: "marketing_assets",
    refId: assetId,
    meta: { asset_id: assetId },
  });
}

/** What the edge function injects so this module stays free of Deno and provider code. */
