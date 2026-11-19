import { prepareBuild } from "../landing/page-build.ts";
import { liveUrl, loadLandingTarget } from "../landing/page-target.ts";
import { landingStateOf } from "../landing/project.ts";
import { updateLanding } from "../landing/store.ts";
import { type ToolContext } from "../tool-context.ts";
import { NO_REPO } from "./landing-build.ts";
import { loadLandingProject } from "./landing-project.ts";

/**
 * Publishes the build the user approved: marks the page published on its branch and opens the
 * pull request. The repository merges a single-page change by itself once its checks pass; a
 * client's first page also creates the site, which a person merges. Carmen never merges.
 */
export async function workshopPublishLandingPage(ctx: ToolContext) {
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
  const state = landingStateOf(project.payload);
  const build = state.build;
  if (!build || state.publish_approved !== build.digest) {
    return {
      error:
        "המשתמש עוד לא אישר לפרסם את הבנייה הזאת. שלחי לו את התצוגה המקדימה ובקשי אישור.",
    };
  }
  const target = await loadLandingTarget(supabase, tenantId, project.id);
  if ("error" in target) {
    return target;
  }
  if (!target.hasLeadDestination) {
    return {
      error:
        "לעמוד אין יעד ללידים, ולידים שיגיעו לא יגיעו לאף אחד. בקשי מהמשתמש להגדיר יעד בהגדרות שבראש הפרויקט.",
    };
  }

  try {
    const prepared = await prepareBuild(repo, target, state, {
      itemId: project.id,
      status: "published",
      today: new Date().toISOString().slice(0, 10),
    });
    if ("error" in prepared) {
      return prepared;
    }
    if (prepared.digest !== build.digest) {
      return {
        error:
          "הקופי או הסגנון השתנו מאז התצוגה שהמשתמש אישר. בני מחדש (workshop_build_landing_page) ובקשי אישור לתצוגה החדשה.",
      };
    }
    const page = `${target.site.subdomain}/${target.slug}`;
    await repo.pushFiles(
      prepared.branch,
      prepared.files,
      `page(${page}): publish from Carmen Workshop`,
    );
    const pullUrl = await repo.openPull(
      prepared.branch,
      `page(${page}): publish`,
      `Built and published from Carmen Workshop, project ${project.id}. The user approved this build's preview.`,
    );
    const published = {
      digest: build.digest,
      pull_url: pullUrl,
      live_url: liveUrl(target),
    };
    await updateLanding(supabase, tenantId, project.id, () => ({ published }));
    return {
      success: true,
      ...published,
      say_to_user: prepared.newSite
        ? `שלחתי את העמוד לפרסום. זה העמוד הראשון של הלקוח, ולכן הוא מחכה לאישור ידני בריפו: ${pullUrl}\nאחרי האישור הוא יעלה ב-${published.live_url}`
        : `שלחתי את העמוד לפרסום. אם הבדיקות עוברות הוא עולה לאוויר בתוך כמה דקות: ${published.live_url}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`landing publish: project ${project.id} failed: ${message}`);
    return { error: `פרסום העמוד נכשל: ${message}` };
  }
}
