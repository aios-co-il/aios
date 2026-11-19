import { pageFolder } from "../landing/page-files.ts";
import { importLandingPage } from "../landing/page-import.ts";
import { loadLandingTarget } from "../landing/page-target.ts";
import { landingStyleText } from "../landing/page-style.ts";
import { landingCopyText } from "../landing/page-text.ts";
import { landingStateOf } from "../landing/project.ts";
import { updateLanding } from "../landing/store.ts";
import { recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";
import { NO_REPO } from "./landing-build.ts";
import { loadLandingProject } from "./landing-project.ts";

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
    return { error: NO_REPO };
  }
  if (landingStateOf(project.payload).blocks) {
    return { error: HAS_COPY };
  }
  const target = await loadLandingTarget(supabase, tenantId, project.id);
  if ("error" in target) {
    return target;
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
    const copyText = landingCopyText(blocks);
    const styleText = landingStyleText(style);
    await recordArtifact(supabase, {
      tenantId,
      itemId: project.id,
      kind: "landing_copy",
      title: project.title || "קופי לעמוד נחיתה",
      meta: { text: copyText, blocks },
    });
    await recordArtifact(supabase, {
      tenantId,
      itemId: project.id,
      kind: "landing_style",
      title: "סגנון עיצובי",
      meta: { text: styleText, style },
    });
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
