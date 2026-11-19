import { parseLandingBlocks } from "../landing/page-content.ts";
import { landingCopyText } from "../landing/page-text.ts";
import { BUILD_CLEARED, COPY_CHOICE } from "../landing/project.ts";
import { updateLanding } from "../landing/store.ts";
import { recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";
import { loadLandingProject } from "./landing-project.ts";

/** Saves a landing page's copy and shows it to the user for approval. */
export async function workshopSaveLandingCopy(ctx: ToolContext) {
  const { supabase, tenantId, args } = ctx;
  const loaded = await loadLandingProject(ctx);
  if ("error" in loaded) {
    return loaded;
  }
  const { project } = loaded;

  const { blocks, problems } = parseLandingBlocks(args.blocks);
  if (problems.length > 0) {
    return {
      error: "הקופי לא נשמר: צריך לתקן ולשמור שוב",
      problems,
    };
  }

  const text = landingCopyText(blocks);
  try {
    // A new copy is a new thing to approve, whatever was approved before it.
    const saved = await updateLanding(supabase, tenantId, project.id, () => ({
      blocks,
      copy_approved: false,
      ...BUILD_CLEARED,
    }));
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId: project.id,
      kind: "landing_copy",
      title: project.title || "קופי לעמוד נחיתה",
      meta: { text, blocks },
    }).catch(async (error) => {
      // The board would not show the new copy: put the previous one back before failing. A
      // restore that fails too is logged and never hides why the save failed.
      await updateLanding(supabase, tenantId, project.id, () => ({
        blocks: saved.before.blocks,
        copy_approved: saved.before.copy_approved,
        build: saved.before.build,
        publish_approved: saved.before.publish_approved,
      })).catch((restoreError) =>
        console.error(
          `landing copy: previous copy of project ${project.id} not restored: ${restoreError instanceof Error ? restoreError.message : "unknown error"}`,
        ),
      );
      throw error;
    });
    return {
      success: true,
      sections: blocks.length,
      artifact,
      say_to_user: `${text}\n\n${COPY_CHOICE}`,
      workshop: {
        event: "artifacts",
        item_id: project.id,
        artifact_id: artifact.id,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הקופי נכשלה",
    };
  }
}
