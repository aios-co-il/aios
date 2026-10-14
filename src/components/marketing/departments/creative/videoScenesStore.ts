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
import { referenceVideoPath, type ReferenceRun } from "./videoReference";

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
      rows
        .flatMap((row) => [
          row.still_asset_id,
          row.clip_asset_id,
          row.voice_asset_id,
        ])
        .filter((id): id is string => !!id),
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

const CREATIVE_VIDEO_BUCKET = "creative-video";

/** Uploads a reference video, records it as an asset and queues its analysis for the worker. */
export async function queueReferenceAnalysis({
  tenantId,
  clientId,
  itemId,
  stageId,
  file,
}: {
  tenantId: string;
  clientId: string | null;
  itemId: string;
  stageId: string;
  file: File;
}) {
  const path = referenceVideoPath({
    tenantId,
    clientId,
    itemId,
    fileName: file.name,
  });
  const { error: uploadError } = await supabase.storage
    .from(CREATIVE_VIDEO_BUCKET)
    .upload(path, file, { contentType: file.type || "video/mp4" });
  if (uploadError) throw uploadError;
  const { data: asset, error: assetError } = await supabase
    .from("marketing_assets")
    .insert({
      tenant_id: tenantId,
      item_id: itemId,
      stage_id: stageId,
      type: "reference_video",
      url: path,
      meta: {
        bucket: CREATIVE_VIDEO_BUCKET,
        path,
        name: file.name,
        size: file.size,
        mime: file.type,
      },
    })
    .select("id")
    .single();
  if (assetError) throw assetError;
  const { error: runError } = await supabase.from("marketing_runs").insert({
    tenant_id: tenantId,
    item_id: itemId,
    stage_id: stageId,
    kind: "reference_analysis",
    status: "queued",
    input: { bucket: CREATIVE_VIDEO_BUCKET, path, asset_id: asset.id },
  });
  if (runError) throw runError;
}

/** Latest reference analysis run of a project. */
export async function fetchLatestReferenceRun(
  tenantId: string,
  itemId: string,
): Promise<ReferenceRun | null> {
  const { data, error } = await supabase
    .from("marketing_runs")
    .select("id,status,error,created_at,output")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("kind", "reference_analysis")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ReferenceRun | null) ?? null;
}

/** Short-lived URLs for files in the private creative-video bucket. */
export async function signCreativeVideoPaths(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(CREATIVE_VIDEO_BUCKET)
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  return Object.fromEntries(
    (data ?? [])
      .filter((row) => row.path && row.signedUrl)
      .map((row) => [row.path as string, row.signedUrl]),
  );
}

/** Queues image-to-video runs for these scenes; scenes already animating are skipped. */
export async function queueSceneClips({
  itemId,
  stageId,
  sceneIds,
  aspect,
  estimate,
  provider,
  generateAudio,
}: {
  itemId: string;
  stageId: string;
  sceneIds: string[];
  aspect: string;
  estimate: { usd: number; credits: number };
  provider: string;
  generateAudio: boolean;
}): Promise<number> {
  const { data, error } = await supabase.rpc("queue_video_clips", {
    p_item_id: itemId,
    p_scene_ids: sceneIds,
    p_aspect: aspect,
    p_estimate: estimate as unknown as Json,
    p_stage_id: stageId,
    p_provider: provider,
    p_generate_audio: generateAudio,
  });
  if (error) throw error;
  return (data ?? []).length;
}

/** Queues ElevenLabs voiceovers, or one music bed for the storyboard. */
export async function queueSceneSound({
  itemId,
  stageId,
  kind,
  sceneIds,
  estimate,
  prompt,
  voiceId,
}: {
  itemId: string;
  stageId: string;
  kind: "voice" | "music";
  sceneIds: string[];
  estimate: { usd: number; credits: number };
  prompt?: string;
  voiceId?: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc("queue_video_sound", {
    p_item_id: itemId,
    p_kind: kind,
    p_scene_ids: sceneIds,
    p_provider: "elevenlabs",
    p_estimate: estimate as unknown as Json,
    p_stage_id: stageId,
    p_prompt: prompt,
    p_voice_id: voiceId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).length;
}

export interface RenderRun {
  id: string;
  status: string;
  error: string | null;
  created_at: string;
  output: { path?: string; duration_s?: number; scene_count?: number } | null;
}

/** Latest finished-film run of a project. */
export async function fetchLatestRenderRun(
  tenantId: string,
  itemId: string,
): Promise<RenderRun | null> {
  const { data, error } = await supabase
    .from("marketing_runs")
    .select("id,status,error,created_at,output")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("kind", "render")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as RenderRun | null) ?? null;
}

/** Queues one local film assembly from the project's approved clips. */
export async function queueVideoRender({
  itemId,
  stageId,
  aspect,
}: {
  itemId: string;
  stageId: string;
  aspect: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("queue_video_render", {
    p_item_id: itemId,
    p_aspect: aspect,
    p_stage_id: stageId,
  });
  if (error) throw error;
  return (data ?? []).length;
}

/** Approves (or un-approves) the scene's current clip. */
export async function approveSceneClip(
  tenantId: string,
  sceneId: string,
  approved: boolean,
) {
  const { error } = await supabase
    .from("marketing_video_scenes")
    .update({ status: approved ? "clip_approved" : "clip_ready" })
    .eq("tenant_id", tenantId)
    .eq("id", sceneId);
  if (error) throw error;
}
