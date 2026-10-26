import { buildEditScenes } from "../edit-tool.ts";
import {
  briefProject,
  loadAssets,
  loadProject,
  savePayload,
} from "../project-io.ts";
import { recordArtifact } from "../record.ts";
import { loadScenes } from "../scene-helpers.ts";
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
    loadScenes: (id) =>
      loadScenes(supabase, tenantId, id) as Promise<{ id: string }[]>,
  });
  if ("error" in built) return built;
  await savePayload(supabase, tenantId, itemId, {
    ...brief.payload,
    project_type: "video",
    workshop_edit: true,
  });
  const total = built.rows.reduce((sum, row) => sum + row.duration_s, 0);
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "storyboard",
    title: `עריכה מהחומרים · ${built.rows.length} סצנות`,
    meta: {
      total_s: total,
      scenes: built.rows,
      text: built.rows
        .map(
          (row) =>
            `${row.position}. ${row.title} (${row.duration_s} ש׳)${
              row.overlay_text ? `\nכיתוב: ${row.overlay_text}` : ""
            }${row.voiceover_text ? `\nקריינות: ${row.voiceover_text}` : ""}`,
        )
        .join("\n\n"),
    },
  });
  return {
    success: true,
    scenes: built.rows.length,
    total_s: total,
    ...(built.failed.length > 0 ? { not_attached: built.failed } : {}),
    artifact,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifact.id,
    },
    message:
      "הסצנות נבנו מהחומרים ומופיעות בלוח. להרכבת הסרט קראי ל-workshop_produce_video: עם engine=mock התמונות זזות בתנועת מצלמה בלי עלות, ומנוע בתשלום מנפיש אותן.",
  };
}
