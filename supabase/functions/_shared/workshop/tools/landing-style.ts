import { landingStyleText, parseLandingStyle } from "../landing/page-style.ts";
import { STYLE_CHOICE } from "../landing/project.ts";
import { updateLanding } from "../landing/store.ts";
import { recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";
import { loadLandingProject } from "./landing-project.ts";

const COPY_NOT_APPROVED =
  "הקופי עוד לא אושר: קודם workshop_save_landing_copy ואישור של המשתמש, ורק אז סגנון";

/** Saves a landing page's visual style and shows it to the user for approval. */
export async function workshopSaveLandingStyle(ctx: ToolContext) {
  const { supabase, tenantId, args } = ctx;
  const loaded = await loadLandingProject(ctx);
  if ("error" in loaded) {
    return loaded;
  }
  const { project } = loaded;

  const { style, problems } = parseLandingStyle(args);
  if (!style) {
    return { error: "הסגנון לא נשמר: צריך לתקן ולשמור שוב", problems };
  }

  const text = landingStyleText(style);
  try {
    // The copy's approval is read from the database at the moment of the write, not from the
    // project as it was loaded: a copy saved in between is unapproved and must stay so.
    const saved = await updateLanding(
      supabase,
      tenantId,
      project.id,
      (current) =>
        current.copy_approved ? { style, style_approved: false } : null,
    );
    if (!saved.changed) {
      return { error: COPY_NOT_APPROVED };
    }
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId: project.id,
      kind: "landing_style",
      title: "סגנון עיצובי",
      meta: { text, style },
    }).catch(async (error) => {
      // The board would not show the new style: put the previous one back before failing.
      await updateLanding(supabase, tenantId, project.id, () => ({
        style: saved.before.style,
        style_approved: saved.before.style_approved,
      }));
      throw error;
    });
    return {
      success: true,
      artifact,
      say_to_user: `${text}\n\n${STYLE_CHOICE}`,
      workshop: {
        event: "artifacts",
        item_id: project.id,
        artifact_id: artifact.id,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הסגנון נכשלה",
    };
  }
}
