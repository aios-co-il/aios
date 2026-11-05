import type { Json } from "@/integrations/supabase/types";
import type { CreativeVariation } from "./types";
import { creativeVariation } from "./creativeAssetPayload";
import { supabase } from "@/integrations/supabase/client";

/** Preflight both snapshots, then compensate only this save's image if its project fails. */
export async function saveCreativeVariation({
  itemId,
  tenantId,
  stageId,
  payload,
  active,
}: {
  itemId: string;
  tenantId: string;
  stageId: string | null;
  payload: unknown;
  active: CreativeVariation | undefined;
}) {
  const variation = active ? normalizeCreativeVariation(active) : undefined;
  const projectPayload: Json = JSON.parse(JSON.stringify(payload));
  const asset = variation
    ? {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        item_id: itemId,
        stage_id: stageId,
        type: "image",
        url: variation.imageUrl,
        content: JSON.stringify({
          layers: variation.layers,
          format: variation.format,
        }),
        meta: projectCreativeAssetMeta(variation),
      }
    : undefined;
  if (asset) {
    const { error } = await supabase.from("marketing_assets").insert(asset);
    if (error) throw error;
  }
  try {
    await persistCreativeProject(itemId, tenantId, projectPayload);
  } catch (error) {
    if (asset) await removeCreativeAsset(asset, error);
    throw error;
  }
}

/** Persist the original seven-field projection of a validated complete variation. */
export function serializeCreativeAssetMeta(variation: CreativeVariation): Json {
  return projectCreativeAssetMeta(normalizeCreativeVariation(variation));
}

/** Reject invalid fields without logging private asset values. */
function normalizeCreativeVariation(
  variation: CreativeVariation,
): CreativeVariation {
  const parsed = creativeVariation.safeParse(variation);
  if (!parsed.success) {
    console.error("Invalid creative asset variation", {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    throw new Error("נתוני גרסת הקריאייטיב אינם תקינים");
  }
  return parsed.data;
}

/** Convert the normalized metadata to its storage representation. */
function projectCreativeAssetMeta(active: CreativeVariation): Json {
  return JSON.parse(
    JSON.stringify({
      source: "manual_edit",
      skin_slug: "social_media",
      variation_id: active.id,
      variation_name: active.name,
      comments: active.comments,
      layers: active.layers,
      format: active.format,
    }),
  );
}

/** Require one affected project; a disappeared or inaccessible row is a save failure. */
async function persistCreativeProject(
  itemId: string,
  tenantId: string,
  payload: Json,
) {
  const { error } = await supabase
    .from("marketing_work_items")
    .update({ payload })
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .select("id")
    .single();
  if (error) throw error;
}

/** Remove only this save's image without rolling back any concurrent project updates. */
async function removeCreativeAsset(
  asset: { id: string; tenant_id: string; item_id: string },
  projectError: unknown,
) {
  // Image assets do not enter workshop_mirror_asset's derived artifact branches.
  try {
    const { error } = await supabase
      .from("marketing_assets")
      .delete()
      .eq("id", asset.id)
      .eq("tenant_id", asset.tenant_id)
      .eq("item_id", asset.item_id)
      .select("id")
      .single();
    if (error) throw error;
  } catch (cleanupError) {
    console.error("Creative asset compensation failed", {
      error: projectError,
      cleanupError,
    });
    throw new Error("שמירת הפרויקט וניקוי תמונת הנכס נכשלו");
  }
}
