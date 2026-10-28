import { buildEditScenes } from "../edit-tool.ts";
import {
  briefProject,
  loadAssets,
  loadProject,
  savePayload,
} from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { loadScenes, paidReplaceRefusal } from "../scene-helpers.ts";
import { storyboardText } from "../storyboard-text.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopEditFromAssets(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const brief = await briefProject(deps, loaded.project.payload, args, {
    kind: "video",
    save: (next) => savePayload(supabase, tenantId, itemId, next),
    needsEngine: false,
    needsStyle: false,
  });
  if ("gate" in brief) return brief.gate;
  const built = await buildEditScenes(supabase, tenantId, itemId, args, {
    loadAssets: (id) => loadAssets(supabase, tenantId, id),
    loadScenes: (id) => loadScenes(supabase, tenantId, id),
    replaceRefusal: (old) => paidReplaceRefusal(supabase, tenantId, old, deps),
  });
  if ("error" in built) return built;
  await savePayload(supabase, tenantId, itemId, {
    ...brief.payload,
    project_type: "video",
    workshop_edit: true,
  });
  const total = built.rows.reduce((sum, row) => sum + row.duration_s, 0);
  const talking = built.plan.filter((scene) => scene.talking).length;
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "storyboard",
    title: `עריכה מהחומרים · ${built.rows.length} סצנות`,
    meta: {
      total_s: total,
      scenes: built.rows,
      text: storyboardText(built.rows, true),
    },
  });
  const voiceChosen =
    String(asRecord(brief.payload.video).voice_id ?? "").trim() !== "";
  return {
    success: true,
    scenes: built.rows.length,
    total_s: total,
    format: String(brief.payload.format ?? "9:16"),
    ...(talking > 0
      ? {
          talking_scenes: talking,
          talking_note: voiceChosen
            ? "הסצנות המדברות יגידו את המשפטים בקול שנבחר לפרויקט, בליפ סינק על התמונות של המשתמש."
            : "יש סצנות מדברות ועוד לא נבחר קול: לפני ההפקה workshop_choose_voice, כדי שהמשפטים יהיו בקול שהמשתמש בחר.",
        }
      : {}),
    ...(built.failed.length > 0 ? { not_attached: built.failed } : {}),
    artifact,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifact.id,
    },
    message:
      "הסצנות נבנו מהחומרים ומופיעות בלוח. אם המשתמש ביקש לאשר את התסריט או את המשפטים לפני ההפקה, הציגי לו אותם ועצרי עד שיאשר; שינוי בסצנה אחת עם workshop_update_scene. להרכבת הסרט קראי ל-workshop_produce_video: עם engine=mock התמונות זזות בתנועת מצלמה בלי עלות, ומנוע בתשלום מנפיש אותן.",
  };
}
