/**
 * workshop_edit_from_assets: the video editor's tool. Builds the film's scenes from the videos
 * and pictures the user uploaded to the project, attaches each one to its scene, and leaves the
 * project ready for workshop_produce_video. Free: nothing is generated here.
 */

import { ASSET_BUCKET, type AssetView } from "./assets.ts";
import { pickMaterials, planEditScenes } from "./edit-plan.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** Signed links last a week, enough for the film to be rendered from them. */
const LINK_SECONDS = 7 * 24 * 60 * 60;

export const EDIT_TOOL = {
  name: "workshop_edit_from_assets",
  description:
    "עורכת סרט מהחומרים של המשתמש: כל סרטון או תמונה שהועלו ללשונית הנכסים של הפרויקט הופכים לסצנה, לפי הסדר. סרטון נכנס כמו שהוא, ותמונה מקבלת תנועת מצלמה בסרט (או הנפשה במנוע בתשלום בהפקה). אפשר לתת כיתוב וקריינות לכל סצנה. לא עולה כסף. אחר כך workshop_produce_video מרכיב את הסרט.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
      asset_ids: {
        type: "array",
        items: { type: "string" },
        description:
          "הנכסים לפי סדר הסרט. בלי זה: כל הסרטונים והתמונות של הפרויקט לפי סדר ההעלאה.",
      },
      captions: {
        type: "array",
        items: { type: "string" },
        description: "כיתוב על המסך לכל סצנה, לפי הסדר.",
      },
      voiceover: {
        type: "array",
        items: { type: "string" },
        description: "קריינות לכל סצנה, לפי הסדר.",
      },
      image_seconds: {
        type: "number",
        description: "כמה שניות כל תמונה על המסך (ברירת מחדל 3).",
      },
      film_brief: { type: "string" },
      brief_answers: { type: "object" },
      replace: {
        type: "boolean",
        description: "true מחליף סטוריבורד קיים.",
      },
    },
    required: ["item_id"],
  },
};

export interface EditHelpers {
  loadAssets: (itemId: string) => Promise<AssetView[]>;
  loadScenes: (itemId: string) => Promise<{ id: string }[]>;
}

/** Saves the scenes and attaches each material; returns the saved rows or an error. */
export async function buildEditScenes(
  supabase: Db,
  tenantId: string,
  itemId: string,
  args: Record<string, unknown>,
  helpers: EditHelpers,
) {
  const materials = pickMaterials(
    await helpers.loadAssets(itemId),
    args.asset_ids,
  );
  if (materials.length === 0)
    return {
      error:
        "אין בפרויקט סרטונים או תמונות לעריכה. בקשי מהמשתמש להעלות אותם בלשונית הנכסים או לגרור לצ׳אט.",
    };
  const old = await helpers.loadScenes(itemId);
  if (old.length > 0 && args.replace !== true)
    return { error: "כבר יש סטוריבורד. replace=true יחליף אותו." };
  const plan = planEditScenes(materials, args);
  const saved = await supabase.rpc("save_video_storyboard", {
    p_item_id: itemId,
    p_scenes: plan.map((scene) => scene.row),
  });
  if (saved.error) return { error: saved.error.message };
  if (old.length > 0) {
    const removed = await supabase
      .from("marketing_video_scenes")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .in(
        "id",
        old.map((scene) => scene.id),
      );
    if (removed.error) return { error: removed.error.message };
  }
  const failed: string[] = [];
  for (const scene of plan) {
    const link = scene.storagePath
      ? (
          await supabase.storage
            .from(ASSET_BUCKET)
            .createSignedUrl(scene.storagePath, LINK_SECONDS)
        ).data?.signedUrl
      : scene.url;
    const attached = link
      ? await supabase.rpc("attach_video_scene_asset", {
          p_scene_id: scene.row.id,
          p_kind: scene.kind,
          p_url: link,
          p_meta: { source: "user_asset", asset_id: scene.assetId },
        })
      : { error: { message: "no link" } };
    if (attached.error) failed.push(scene.row.title);
  }
  return { rows: plan.map((scene) => scene.row), plan, failed };
}
