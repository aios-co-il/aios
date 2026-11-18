import { parseLandingBlocks } from "../landing/page-content.ts";
import { landingCopyText } from "../landing/page-text.ts";
import { COPY_CHOICE, withLanding } from "../landing/project.ts";
import { savePayload } from "../project-io.ts";
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
    await savePayload(
      supabase,
      tenantId,
      project.id,
      withLanding(project.payload, { blocks, copy_approved: false }),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הקופי נכשלה",
    };
  }
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId: project.id,
    kind: "landing_copy",
    title: project.title || "קופי לעמוד נחיתה",
    meta: { text, blocks },
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
}
