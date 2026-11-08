/** The assets a lip sync reads for its scene: its voice, still and clip (lipsync.ts). */
import type { SupabaseRest } from "../supabaseRest.ts";
import { rowsOf } from "./rows.ts";
import type { MediaAsset, VideoRun } from "./types.ts";

/** The tenant's asset of `type` with this id, when it has a stored file. */
export const asset = async (
  db: Pick<SupabaseRest, "select">,
  run: Pick<VideoRun, "tenant_id">,
  id: string | null | undefined,
  type: string,
): Promise<MediaAsset | null> => {
  if (!id) {
    return null;
  }
  const [row] = rowsOf<MediaAsset>(
    await db.select(
      "marketing_assets",
      `id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&type=eq.${type}&select=id,url,meta`,
    ),
  );
  return row?.url ? row : null;
};

/**
 * The scene's animated clip, which carries its own movement (motion_prompt): the current clip, or
 * the one an earlier lip sync of the scene was made over, so a new line keeps the movement. A clip
 * that talks (a one-shot talking clip, or a lip sync with no clip behind it) has none to keep.
 */
export async function motionClipOf(
  db: Pick<SupabaseRest, "select">,
  run: Pick<VideoRun, "tenant_id">,
  clip: MediaAsset | null,
) {
  if (!clip) {
    return null;
  }
  if (clip.meta?.lipsync !== true) {
    return clip;
  }
  const id =
    clip.meta?.motion_clip_asset_id ||
    (clip.meta?.source_kind === "clip" ? clip.meta?.source_asset_id : null);
  const earlier = await asset(db, run, id, "video_clip");
  return earlier && earlier.meta?.lipsync !== true ? earlier : null;
}
