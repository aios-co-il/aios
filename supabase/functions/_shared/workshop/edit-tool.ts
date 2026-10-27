/**
 * workshop_edit_from_assets: the video editor's tool. Builds the film's scenes from the videos
 * and pictures the user uploaded to the project, attaches each one to its scene, and leaves the
 * project ready for workshop_produce_video. Free: nothing is generated here.
 */

import { ASSET_BUCKET, type AssetView } from "./assets.ts";
import { pickMaterials, planEditScenes } from "./edit-plan.ts";
import { asRecord } from "./record.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** Signed links last a week, enough for the film to be rendered from them. */
const LINK_SECONDS = 7 * 24 * 60 * 60;

export const EDIT_TOOL = {
  name: "workshop_edit_from_assets",
  description:
    "עורכת סרט מהחומרים של המשתמש: כל סרטון או תמונה שהועלו ללשונית הנכסים של הפרויקט הופכים לסצנה, לפי הסדר. סרטון נכנס כמו שהוא, ותמונה מקבלת תנועה בסרט (motion) או הנפשה במנוע בתשלום בהפקה. אפשר לתת לכל סצנה כותרת, כיתוב, קריינות, תנועה ואורך. סצנה מדברת: כשהמשתמש מבקש שהדמות בתמונה תדבר למצלמה (למשל כל סקין מציגה את עצמה), מעבירים לסצנה lipsync=true ו-dialogue עם המשפט שלה, ו-speaker. הדמות בתמונה של המשתמש עצמה אומרת את המשפט בליפ סינק, בקול שנבחר לפרויקט (workshop_choose_voice), ולא בקול של המנוע. כשכל תמונה היא לוק אחר של אותה דמות (הסקינים של כרמן), skin_switch=true בכל סצנה שעוברת ללוק אחר. התמונות הן תמיד התמונות האמיתיות שהמשתמש העלה, אף פעם לא תמונה שהומצאה. כל המערכים לפי סדר הסצנות. הפורמט נשאר של הפרויקט (סרט לרילס הוא 9:16), ותמונה בגודל אחר ממלאת את המסך בחיתוך, בלי מתיחה. לא עולה כסף. כשהמשתמש ביקש לאשר את התסריט לפני: הציגי לו את הסצנות והמשפטים ועצרי עד שהוא מאשר, ורק אז workshop_produce_video מרכיב את הסרט.",
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
      titles: {
        type: "array",
        items: { type: "string" },
        description:
          "שם קצר לכל סצנה בלוח (למשל הקמפיינרית), לפי הסדר. בלי זה: שם הקובץ.",
      },
      captions: {
        type: "array",
        items: { type: "string" },
        description: "כיתוב על המסך לכל סצנה, לפי הסדר.",
      },
      voiceover: {
        type: "array",
        items: { type: "string" },
        description:
          "קריינות לכל סצנה, לפי הסדר. בסצנה מדברת בלי dialogue, הדמות אומרת את הקריינות.",
      },
      motion: {
        type: "array",
        items: { type: "string" },
        description:
          "איך כל תמונה זזה, באנגלית, לפי הסדר (למשל slow push-in on her face, she turns to the camera and smiles). לתת לכל סקין תנועה אחרת.",
      },
      lipsync: {
        type: "array",
        items: { type: "boolean" },
        description:
          "true לסצנה שבה הדמות בתמונה מדברת למצלמה בליפ סינק, לפי הסדר. רק לתמונות, לא לסרטונים.",
      },
      dialogue: {
        type: "array",
        items: { type: "string" },
        description:
          "המשפט שהדמות אומרת למצלמה בסצנה, בעברית, לפי הסדר. סצנה עם משפט מדברת גם בלי lipsync, אלא אם lipsync=false.",
      },
      speaker: {
        type: "array",
        items: { type: "string" },
        description:
          "מי מדברת בכל סצנה, באנגלית, לפי הסדר (למשל Carmen, a 3D animated woman with long curly brown hair in a black blazer).",
      },
      skin_switch: {
        type: "array",
        items: { type: "boolean" },
        description:
          "מעבר החלפת סקין (הבזק, פופ וסוויפ של אור) לפי סדר הסצנות: true בסצנה שהמעבר אליה מחליף את הלוק של אותה דמות (למשל מסקין אחד של כרמן לאחר), false לבטל. לסצנה הראשונה אין מעבר.",
      },
      durations: {
        type: "array",
        items: { type: "number" },
        description:
          "אורך כל סצנה בשניות, לפי הסדר. בלי זה: image_seconds לתמונה, ולסצנה מדברת מספיק זמן למשפט.",
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
  // A talking picture speaks in the project's chosen voice, never the engine's: the clip job
  // leaves its clip silent and the lip-sync pass makes the user's own picture say the line.
  // A skin switch is kept in meta too (save_video_storyboard keeps only its own keys).
  const savedMeta = new Map(
    (Array.isArray(saved.data) ? saved.data : []).map(
      (row: Record<string, unknown>) => [String(row.id), asRecord(row.meta)],
    ),
  );
  for (const scene of plan.filter(
    (entry) => entry.talking || entry.skinSwitch !== null,
  )) {
    const meta = {
      ...(savedMeta.get(scene.row.id) ??
        (scene.talking
          ? {
              lipsync: true,
              speaker: scene.row.speaker ?? "",
              dialogue: scene.row.dialogue ?? "",
            }
          : {})),
      ...(scene.talking ? { chosen_voice: true } : {}),
      ...(scene.skinSwitch !== null ? { skin_switch: scene.skinSwitch } : {}),
    };
    const marked = await supabase
      .from("marketing_video_scenes")
      .update({ meta })
      .eq("id", scene.row.id)
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId);
    if (marked.error) return { error: marked.error.message };
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
