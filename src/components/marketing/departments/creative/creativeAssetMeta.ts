import type { Json } from "@/integrations/supabase/types";
import type { CreativeVariation } from "./types";
import { creativeVariation } from "./creativeAssetPayload";
import { supabase } from "@/integrations/supabase/client";

/** Validate the asset before either the project or its asset snapshot is written. */
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
  payload: Json;
  active: CreativeVariation | undefined;
}) {
  const meta = active ? serializeCreativeAssetMeta(active) : null;
  const { error: itemError } = await supabase
    .from("marketing_work_items")
    .update({ payload })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (itemError) {
    throw itemError;
  }
  if (active) {
    const { error: assetError } = await supabase
      .from("marketing_assets")
      .insert({
        tenant_id: tenantId,
        item_id: itemId,
        stage_id: stageId,
        type: "image",
        url: active.imageUrl,
        content: JSON.stringify({
          layers: active.layers,
          format: active.format,
        }),
        meta,
      });
    if (assetError) {
      throw assetError;
    }
  }
}

/** Persist the editor asset projection after validating its complete variation. */
export function serializeCreativeAssetMeta(variation: CreativeVariation): Json {
  const parsed = creativeVariation.safeParse(variation);
  if (!parsed.success) {
    console.error("Invalid creative asset variation", {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    throw new Error("נתוני גרסת הקריאייטיב אינם תקינים");
  }
  const active = parsed.data;
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
