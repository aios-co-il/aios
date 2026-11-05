import type { Json } from "@/integrations/supabase/types";
import type { CreativeVariation } from "./types";
import { creativeVariation } from "./creativeAssetPayload";
import { supabase } from "@/integrations/supabase/client";

/** Preflight both snapshots, then persist them in one caller-authorized transaction. */
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
  const { error } = await supabase.rpc("save_creative_variation", {
    p_item_id: itemId,
    p_tenant_id: tenantId,
    p_payload: projectPayload,
    p_stage_id: stageId ?? undefined,
    ...(variation
      ? {
          p_url: variation.imageUrl,
          p_content: JSON.stringify({
            layers: variation.layers,
            format: variation.format,
          }),
          p_meta: projectCreativeAssetMeta(variation),
        }
      : {}),
  });
  if (error) throw error;
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
