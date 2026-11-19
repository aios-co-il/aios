import { pageFolder } from "../landing/page-files.ts";
import type { LandingBlock } from "../landing/page-content.ts";
import { importLandingPage } from "../landing/page-import.ts";
import { loadLandingTarget } from "../landing/page-target.ts";
import { type LandingStyle, landingStyleText } from "../landing/page-style.ts";
import { landingCopyText } from "../landing/page-text.ts";
import { landingStateOf } from "../landing/project.ts";
import { updateLanding } from "../landing/store.ts";
import { recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";
import { loadLandingProject } from "./landing-project.ts";

const NO_IMPORT =
  "ייבוא עמודים זמין רק ב-Production, כשמוגדר שם החיבור לריפו של העמודים. הפרויקט נשאר כמו שהוא.";
const HAS_COPY =
  "בפרויקט כבר יש קופי. ייבוא רק לפרויקט ריק, כדי לא לדרוס עבודה שנעשתה כאן.";

/**
 * Brings a page that is already live into its project: its sections become the project's copy and
 * its theme the project's style, both approved, because they are what visitors see today. From
 * there Carmen edits the page as any other: a new copy or style, approval, build, publish.
 */
export async function workshopImportLandingPage(ctx: ToolContext) {
  const { supabase, tenantId, deps } = ctx;
  const loaded = await loadLandingProject(ctx);
  if ("error" in loaded) {
    return loaded;
  }
  const { project } = loaded;
  const repo = deps.landingRepo;
  if (!repo) {
    return { error: NO_IMPORT };
  }
  if (landingStateOf(project.payload).blocks) {
    return { error: HAS_COPY };
  }
  const target = await loadLandingTarget(supabase, tenantId, project.id);
  if ("error" in target) {
    return target;
  }
  // The page's site belongs to a client too; the project's client was checked when it loaded.
  try {
    await ctx.assertClientAccess(target.site.clientId);
  } catch {
    return { error: "אין הרשאה ללקוח הזה" };
  }

  try {
    const folder = pageFolder(target.site.subdomain, target.slug);
    const content = await repo.readFile(`${folder}/content.json`);
    if (content === null) {
      return {
        error:
          "אין עמוד קיים בכתובת הזו. זה עמוד חדש: כתבי קופי (workshop_save_landing_copy).",
      };
    }
    const imported = importLandingPage(content);
    if ("error" in imported) {
      return imported;
    }
    const { blocks, style } = imported;
    const saved = await updateLanding(
      supabase,
      tenantId,
      project.id,
      (current) =>
        current.blocks
          ? null
          : { blocks, copy_approved: true, style, style_approved: true },
    );
    if (!saved.changed) {
      return { error: HAS_COPY };
    }
    try {
      await recordImport(ctx, project, { blocks, style });
    } catch (error) {
      // The board would not show the import: empty the project again, so a retry can import it.
      await updateLanding(supabase, tenantId, project.id, () => ({
        blocks: saved.before.blocks,
        copy_approved: saved.before.copy_approved,
        style: saved.before.style,
        style_approved: saved.before.style_approved,
      })).catch((restoreError) =>
        console.error(
          `landing import: project ${project.id} not emptied again: ${restoreError instanceof Error ? restoreError.message : "unknown error"}`,
        ),
      );
      throw error;
    }
    return {
      success: true,
      sections: blocks.length,
      say_to_user: `ייבאתי את העמוד כמו שהוא באוויר (${blocks.length} מקטעים). מה לשנות בו?`,
      workshop: { event: "artifacts", item_id: project.id },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`landing import: project ${project.id} failed: ${message}`);
    return { error: `ייבוא העמוד נכשל: ${message}` };
  }
}

/** Puts the imported copy and style on the project's board. */
async function recordImport(
  ctx: ToolContext,
  project: { id: string; title: string | null },
  imported: { blocks: Array<LandingBlock>; style: LandingStyle },
) {
  await recordArtifact(ctx.supabase, {
    tenantId: ctx.tenantId,
    itemId: project.id,
    kind: "landing_copy",
    title: project.title || "קופי לעמוד נחיתה",
    meta: { text: landingCopyText(imported.blocks), blocks: imported.blocks },
  });
  await recordArtifact(ctx.supabase, {
    tenantId: ctx.tenantId,
    itemId: project.id,
    kind: "landing_style",
    title: "סגנון עיצובי",
    meta: { text: landingStyleText(imported.style), style: imported.style },
  });
}
