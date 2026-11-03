import type { Json } from "@/integrations/supabase/types";
import type { CreativeVariation } from "./types";
import { creativeVariation } from "./creativeAssetPayload";

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
