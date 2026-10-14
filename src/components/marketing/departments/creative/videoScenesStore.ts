import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ImageGenerationCost } from "./imageCost";
import type { StoryboardFrame } from "./types";
import { layoutStoryboardRtl, storyboardFrameX } from "./utils";
import {
  VIDEO_SCENE_COLUMNS,
  framesToScenes,
  removedSceneIds,
  scenesToFrames,
  stillsToAttach,
  type SceneStillRecord,
  type VideoSceneRecord,
} from "./videoScenes";

const ID_CHUNK = 100;

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    out.push(values.slice(index, index + size));
  return out;
}

/** Storyboards of the given video projects, keyed by work item id, read from marketing_video_scenes. */
export async function fetchVideoStoryboards(
  tenantId: string,
  itemIds: string[],
): Promise<Record<string, StoryboardFrame[]>> {
  if (itemIds.length === 0) return {};
  const rows: VideoSceneRecord[] = [];
  for (const ids of chunks(itemIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("marketing_video_scenes")
      .select(VIDEO_SCENE_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("item_id", ids)
      .order("position");
    if (error) throw error;
    rows.push(...((data ?? []) as VideoSceneRecord[]));
  }

  const stillIds = [
    ...new Set(
      rows.map((row) => row.still_asset_id).filter((id): id is string => !!id),
    ),
  ];
  const stills = new Map<string, SceneStillRecord>();
  for (const ids of chunks(stillIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("marketing_assets")
      .select("id,url,meta")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) throw error;
    for (const still of (data ?? []) as SceneStillRecord[])
      stills.set(still.id, still);
  }

  const byItem: Record<string, VideoSceneRecord[]> = {};
  for (const row of rows) (byItem[row.item_id] ??= []).push(row);
  const storyboards: Record<string, StoryboardFrame[]> = {};
  for (const itemId of itemIds) {
    storyboards[itemId] = layoutStoryboardRtl(
      scenesToFrames(byItem[itemId] ?? [], stills, storyboardFrameX),
    );
  }
  return storyboards;
}

/**
 * Saves scene text and order, then records stills for frames whose picture changed.
 * Status and asset links are otherwise left to the generation jobs. Only scenes in
 * `persistedStills` (what the editor last loaded or saved) are deleted when missing,
 * so scenes added elsewhere in the meantime survive the save.
 */
export async function saveVideoStoryboard({
  tenantId,
  itemId,
  frames,
  persistedStills,
}: {
  tenantId: string;
  itemId: string;
  frames: StoryboardFrame[];
  persistedStills: Map<string, string | undefined>;
}) {
  const { error } = await supabase.rpc("save_video_storyboard", {
    p_item_id: itemId,
    p_scenes: framesToScenes(frames) as unknown as Json,
  });
  if (error) throw error;

  for (const still of stillsToAttach(persistedStills, frames))
    await attachSceneStill(still);

  const removed = removedSceneIds(persistedStills.keys(), frames);
  if (removed.length === 0) return;
  const { error: deleteError } = await supabase
    .from("marketing_video_scenes")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .in("id", removed);
  if (deleteError) throw deleteError;
}

/** What the scene table holds after a save of these frames. */
export const persistedStillsOf = (frames: StoryboardFrame[]) =>
  new Map(frames.map((frame) => [frame.id, frame.imageUrl] as const));

/** Records a new still version for a scene and makes it the scene's current still. */
export async function attachSceneStill({
  sceneId,
  imageUrl,
  cost,
}: {
  sceneId: string;
  imageUrl: string;
  cost?: ImageGenerationCost;
}) {
  const { error } = await supabase.rpc("attach_video_scene_asset", {
    p_scene_id: sceneId,
    p_kind: "still",
    p_url: imageUrl,
    p_meta: {
      source: "storyboard_editor",
      ...(cost ? { generation_cost: cost } : {}),
    } as unknown as Json,
  });
  if (error) throw error;
}

/** All still versions of a scene, newest first. */
export async function fetchSceneStillVersions(
  tenantId: string,
  sceneId: string,
): Promise<{ id: string; url: string; version: number }[]> {
  const { data, error } = await supabase
    .from("marketing_assets")
    .select("id,url,meta")
    .eq("tenant_id", tenantId)
    .eq("type", "video_still")
    .eq("meta->>scene_id", sceneId);
  if (error) throw error;
  return (data ?? [])
    .filter((row): row is typeof row & { url: string } => !!row.url)
    .map((row) => {
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      return { id: row.id, url: row.url, version: Number(meta.version) || 0 };
    })
    .sort((a, b) => b.version - a.version);
}

/** Makes an earlier still version the scene's current still. */
export async function selectSceneStill(
  tenantId: string,
  sceneId: string,
  assetId: string,
) {
  const { error } = await supabase
    .from("marketing_video_scenes")
    .update({ still_asset_id: assetId, status: "still_ready" })
    .eq("tenant_id", tenantId)
    .eq("id", sceneId);
  if (error) throw error;
}

/** Approves (or un-approves) the scene's current still. */
export async function approveSceneStill(
  tenantId: string,
  sceneId: string,
  approved: boolean,
) {
  const { error } = await supabase
    .from("marketing_video_scenes")
    .update({ status: approved ? "still_approved" : "still_ready" })
    .eq("tenant_id", tenantId)
    .eq("id", sceneId);
  if (error) throw error;
}
