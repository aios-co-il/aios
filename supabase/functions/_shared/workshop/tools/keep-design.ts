/**
 * A finished design (an ad, a poster, a banner with its own text) is kept exactly as it is: the
 * film moves the camera over the original picture instead of sending it to a video model. On
 * Staging (2 Nov) a dive club's poster went to a video model, which redrew it and garbled its
 * Hebrew text. The free preview engine is that camera move; the render also fits the whole
 * picture in the frame (video.keep_design) instead of cropping it.
 */
import { asRecord } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";

/** Whether this production keeps the pictures as designed: the call says so, or the film did. */
export function keepsDesign(
  args: Record<string, unknown>,
  video: Record<string, unknown>,
): boolean {
  if (typeof args.keep_design === "boolean") {
    return args.keep_design;
  }
  return video.keep_design === true;
}

/**
 * The project's payload for a new film (a new storyboard or a new edit): it starts without the
 * last film's choice to keep the design, so the production of the new film makes that choice
 * again. Kept, a film of new pictures was produced as a camera move (Staging, 2 Nov).
 */
export function forgetKeptDesign(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const video = asRecord(payload.video);
  if (!("keep_design" in video)) {
    return payload;
  }
  const next = { ...video };
  delete next.keep_design;
  return { ...payload, video: next };
}

/**
 * Of these clips, the ones a video model made from the scene's picture. A film that keeps its
 * design makes them again as a camera move: kept, the redrawn picture would stay in the film
 * (Staging, 2 Nov). A video the user uploaded was not made from a picture, so it stays.
 */
export async function redrawnClipIds(
  supabase: ToolContext["supabase"],
  tenantId: string,
  itemId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase
    .from("marketing_assets")
    .select("id, meta")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .in("id", ids);
  if (error) {
    throw new Error(`could not read the film's clips: ${error.message}`);
  }
  const rows: { id: string; meta: Record<string, unknown> | null }[] =
    Array.isArray(data) ? data : [];
  return new Set(
    rows
      .filter(
        (row) =>
          typeof row.meta?.source_still_asset_id === "string" &&
          row.meta.provider !== "mock",
      )
      .map((row) => row.id),
  );
}

/**
 * Marks these scenes' clips as out of date, so produce_video makes them again (it queues a clip
 * only for a scene without one, a failed one or an outdated one).
 */
export async function remakeRedrawnClips(
  supabase: ToolContext["supabase"],
  tenantId: string,
  itemId: string,
  sceneIds: string[],
): Promise<void> {
  if (sceneIds.length === 0) {
    return;
  }
  const { error } = await supabase
    .from("marketing_video_scenes")
    .update({ clip_stale: true })
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .in("id", sceneIds);
  if (error) {
    throw new Error(`could not mark the redrawn scenes: ${error.message}`);
  }
}
