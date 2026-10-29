import type { Json } from "@/integrations/supabase/types";
import type { CreativeVariation } from "./types";

/** Type the original metadata projection after the same JSON conversion used by transport. */
export function serializeCreativeAssetMeta(active: CreativeVariation): Json {
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
