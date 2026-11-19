import { prepareBuild } from "../landing/page-build.ts";
import { loadLandingTarget, previewPageUrl } from "../landing/page-target.ts";
import {
  buildTag,
  type LandingBuild,
  landingStateOf,
  PUBLISH_CHOICE,
} from "../landing/project.ts";
import { updateLanding } from "../landing/store.ts";
import { type ToolContext } from "../tool-context.ts";
import { loadLandingProject } from "./landing-project.ts";

/** How long the tool waits for Vercel to build the preview before it answers without a link. */
const PREVIEW_POLLS = 12;
const PREVIEW_POLL_MS = 5_000;

export const NO_REPO =
  "בנייה ופרסום של עמודים זמינים רק ב-Production, כשמוגדר שם החיבור לריפו של העמודים (LANDING_PAGES_GITHUB_TOKEN). אמרי למשתמש שהקופי והסגנון שמורים ומוכנים לבנייה.";

const PROJECT_CHANGED =
  "הפרויקט השתנה בזמן הבנייה (קופי, סגנון או בנייה אחרת). קראי שוב ל-workshop_build_landing_page.";

/**
 * Builds the project's approved copy and style as a draft page on the page's own branch and
 * returns the preview link with the publish question. Calling it again for the same content
 * pushes nothing and only looks for the preview.
 */
export async function workshopBuildLandingPage(ctx: ToolContext) {
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
  if (!state.copy_approved || !state.style_approved) {
    return {
      error: "בונים רק אחרי שהמשתמש אישר גם את הקופי וגם את הסגנון העיצובי.",
    };
  }
  const target = await loadLandingTarget(supabase, tenantId, project.id);
  if ("error" in target) {
    return target;
  }

  try {
    const prepared = await prepareBuild(repo, target, state, {
      itemId: project.id,
      status: "draft",
      today: new Date().toISOString().slice(0, 10),
    });
    if ("error" in prepared) {
      return prepared;
    }
    let build: LandingBuild =
      state.build?.digest === prepared.digest
        ? state.build
        : {
            branch: prepared.branch,
            commit: await repo.pushFiles(
              prepared.branch,
              prepared.files,
              `page(${target.site.subdomain}/${target.slug}): draft from Carmen Workshop`,
            ),
            digest: prepared.digest,
            ...(prepared.newSite ? { new_site: true } : {}),
          };
    const { commit } = build;
    if (build !== state.build) {
      // Saved before the wait: if the preview check fails, the next call resumes this commit.
      // Only onto the project this build was made from: a copy or style saved meanwhile cleared
      // the build, and this write must not put an older one back.
      const pushed = build;
      const saved = await updateLanding(
        supabase,
        tenantId,
        project.id,
        (current) =>
          current.copy_approved &&
          current.style_approved &&
          current.build?.commit === state.build?.commit
            ? { build: pushed }
            : null,
      );
      if (!saved.changed) {
        return { error: PROJECT_CHANGED };
      }
    }
    if (!build.preview_url) {
      const base = await waitForPreview(ctx, commit);
      if (base) {
        const previewed = {
          ...build,
          preview_url: previewPageUrl(base, target),
        };
        // A newer build may have replaced this one during the wait; its preview is not ours.
        const saved = await updateLanding(
          supabase,
          tenantId,
          project.id,
          (current) =>
            current.build?.commit === commit ? { build: previewed } : null,
        );
        if (!saved.changed) {
          return { error: PROJECT_CHANGED };
        }
        build = previewed;
      }
    }
    if (!build.preview_url) {
      return {
        success: true,
        preview_ready: false,
        say_to_user:
          "העמוד נבנה, והתצוגה המקדימה עוד עולה. בעוד דקה אשלח את הקישור.",
      };
    }
    return {
      success: true,
      preview_ready: true,
      preview_url: build.preview_url,
      say_to_user: `העמוד נבנה (${buildTag(build.digest)}). תצוגה מקדימה: ${build.preview_url}${target.hasLeadDestination ? "" : "\nשימו לב: עוד לא הוגדר יעד ללידים בהגדרות שבראש הפרויקט, ובלעדיו אי אפשר לפרסם."}\n\n${PUBLISH_CHOICE}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`landing build: project ${project.id} failed: ${message}`);
    return { error: `בניית העמוד נכשלה: ${message}` };
  }
}

/** Polls for the preview of a commit; null when it is not built within the wait. */
async function waitForPreview(
  ctx: ToolContext,
  commit: string,
): Promise<string | null> {
  const repo = ctx.deps.landingRepo;
  if (!repo) {
    return null;
  }
  const sleep =
    ctx.deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < PREVIEW_POLLS; attempt += 1) {
    const url = await repo.previewUrl(commit);
    if (url) {
      return url;
    }
    await sleep(PREVIEW_POLL_MS);
  }
  return null;
}
