/**
 * Makes workshop_make_stills' scene pictures: one placeholder per scene on the board, the picture
 * from the image engine, and the scene's still attached and shown on its page.
 */

import type { Format } from "../defaults.ts";
import type { WorkshopDeps } from "../gate.ts";
import type { ImageProvider } from "../image-providers.ts";
import { type ProjectLook, sceneReferenceUrl, stillPrompt } from "../look.ts";
import { stillNoText } from "../picture-text.ts";
import {
  ensureStillPage,
  failedPatch,
  openPlaceholders,
  settlePlaceholder,
} from "../placeholders.ts";
import { asRecord } from "../record.ts";
import type { loadScenes } from "../scene-helpers.ts";
import type { ToolContext } from "../tool-context.ts";

/** What every picture of one call is made with; anchorUrl is the anchor frame made so far. */
export interface StillJob {
  ctx: ToolContext;
  itemId: string;
  generateImage: NonNullable<WorkshopDeps["generateImage"]>;
  look: ProjectLook;
  format: Format;
  engine: ImageProvider | null;
  anchorUrl: string | null;
}

/** A storyboard scene as loadScenes reads it. */
export type SceneRow = Awaited<ReturnType<typeof loadScenes>>[number];

/** One scene's outcome: its picture's url when made, else why not. */
export interface StillResult {
  scene: string;
  ok: boolean;
  error?: string;
  url?: string;
}

/** Opens a placeholder for each scene of the group, then makes their pictures side by side. */
export async function renderGroup(
  job: StillJob,
  group: Array<SceneRow>,
): Promise<Array<StillResult>> {
  const { supabase, tenantId } = job.ctx;
  const holders = await openPlaceholders(
    supabase,
    tenantId,
    job.itemId,
    group.map((scene) => ({
      kind: "scene_still" as const,
      title: `סצנה ${scene.position}${scene.title ? ` · ${scene.title}` : ""}`,
      meta: { scene_id: scene.id },
    })),
  );
  return await Promise.all(
    group.map((scene, index) => renderStill(job, scene, holders[index])),
  );
}

/** The scene's own character picture (saved by workshop_storyboard), if it has one. */
export const ownReference = (scene: SceneRow) =>
  sceneReferenceUrl(asRecord(scene.meta).reference_url);

/** Makes one scene's picture and attaches it; a failure settles its placeholder as failed. */
async function renderStill(
  job: StillJob,
  scene: SceneRow,
  holder: string | undefined,
): Promise<StillResult> {
  const { supabase, tenantId } = job.ctx;
  const { look, anchorUrl } = job;
  const fail = async (error: string) => {
    await settlePlaceholder(supabase, tenantId, holder, failedPatch(error));
    return { scene: scene.id, ok: false, error };
  };
  try {
    // A scene with its own picture (the skin worn in it) is made from that picture alone,
    // with the style bible; the others follow the project's references and anchor frame.
    const own = ownReference(scene);
    const references = own
      ? [own]
      : anchorUrl
        ? [...look.references, anchorUrl]
        : look.references;
    const made = await job.generateImage(
      stillPrompt({
        visual: scene.visual_prompt,
        look,
        userReferences: own ? 0 : look.references.length,
        hasAnchor: !own && Boolean(anchorUrl),
        sceneReference: Boolean(own),
        suffix: stillNoText(scene.visual_prompt),
        noText: true,
      }),
      job.format,
      references,
      job.engine ?? undefined,
    );
    if (!made.image_url) {
      return await fail(made.error ?? "לא התקבלה תמונה");
    }
    const attached = await supabase.rpc("attach_video_scene_asset", {
      p_scene_id: scene.id,
      p_kind: "still",
      p_url: made.image_url,
      p_meta: {
        prompt: scene.visual_prompt,
        source: "workshop",
        ...(own ? { reference_url: own } : {}),
      },
    });
    if (attached.error) {
      return await fail(attached.error.message);
    }
    await ensureStillPage(
      supabase,
      tenantId,
      job.itemId,
      scene,
      attached.data,
      made.image_url,
      holder,
    );
    return { scene: scene.id, ok: true, url: made.image_url };
  } catch (error) {
    return await fail(
      error instanceof Error ? error.message : "יצירת התמונה נכשלה",
    );
  }
}
