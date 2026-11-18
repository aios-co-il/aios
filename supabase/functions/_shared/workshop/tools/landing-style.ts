import { landingStyleText, parseLandingStyle } from "../landing/page-style.ts";
import {
  STYLE_CHOICE,
  landingStateOf,
  withLanding,
} from "../landing/project.ts";
import { savePayload } from "../project-io.ts";
import { recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";
import { loadLandingProject } from "./landing-project.ts";

/** Saves a landing page's visual style and shows it to the user for approval. */
export async function workshopSaveLandingStyle(ctx: ToolContext) {
  const { supabase, tenantId, args } = ctx;
  const loaded = await loadLandingProject(ctx);
  if ("error" in loaded) {
    return loaded;
  }
  const { project } = loaded;

  if (!landingStateOf(project.payload).copy_approved) {
    return {
      error:
        "הקופי עוד לא אושר: קודם workshop_save_landing_copy ואישור של המשתמש, ורק אז סגנון",
    };
  }
  const { style, problems } = parseLandingStyle(args);
  if (!style) {
    return { error: "הסגנון לא נשמר: צריך לתקן ולשמור שוב", problems };
  }

  const text = landingStyleText(style);
  try {
    await savePayload(
      supabase,
      tenantId,
      project.id,
      withLanding(project.payload, { style, style_approved: false }),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הסגנון נכשלה",
    };
  }
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId: project.id,
    kind: "landing_style",
    title: "סגנון עיצובי",
    meta: { text, style },
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
}
