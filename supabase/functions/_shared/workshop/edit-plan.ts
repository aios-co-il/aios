/**
 * Turns the project's own materials (videos and pictures the user uploaded in the assets tab)
 * into film scenes, one scene per item in the order asked. A video becomes the scene's clip; a
 * picture becomes its still, which the film moves with a camera move or an engine animates.
 */

import type { AssetView } from "./assets.ts";

const MAX_SCENES = 20;
const DEFAULT_IMAGE_S = 3;
const DEFAULT_VIDEO_S = 5;

export interface EditScene {
  row: {
    id: string;
    position: number;
    title: string;
    shot: string;
    visual_prompt: string;
    motion_prompt: string;
    overlay_text: string;
    voiceover_text: string;
    duration_s: number;
  };
  kind: "clip" | "still";
  assetId: string;
  storagePath: string | null;
  url: string | null;
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const seconds = (value: unknown, fallback: number) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.min(Math.max(amount, 0.5), 30)
    : fallback;
};

const listAt = (value: unknown, index: number) =>
  Array.isArray(value) ? text(value[index]) : "";

const usable = (asset: AssetView) =>
  (asset.asset_type === "video" || asset.asset_type === "image") &&
  Boolean(asset.storage_path || asset.url);

/** Picks the materials (all usable ones by default, or the ids asked for in that order). */
export function pickMaterials(assets: AssetView[], ids: unknown): AssetView[] {
  const wanted = Array.isArray(ids) ? ids.map(text).filter(Boolean) : [];
  const pool = assets.filter(usable);
  if (wanted.length === 0) return pool.slice(0, MAX_SCENES);
  const byId = new Map(pool.map((asset) => [asset.id, asset]));
  return wanted
    .map((id) => byId.get(id))
    .filter((asset): asset is AssetView => Boolean(asset))
    .slice(0, MAX_SCENES);
}

export function planEditScenes(
  materials: AssetView[],
  args: Record<string, unknown>,
  newId: () => string = () => crypto.randomUUID(),
): EditScene[] {
  return materials.map((asset, index) => {
    const isVideo = asset.asset_type === "video";
    const meta = asset.meta ?? {};
    return {
      row: {
        id: newId(),
        position: index + 1,
        title: asset.title || `סצנה ${index + 1}`,
        shot: isVideo ? "Footage" : "Still",
        visual_prompt:
          asset.title || (isVideo ? "user footage" : "user picture"),
        motion_prompt: listAt(args.motion, index),
        overlay_text: listAt(args.captions, index),
        voiceover_text: listAt(args.voiceover, index),
        duration_s: isVideo
          ? seconds(meta.duration_s, DEFAULT_VIDEO_S)
          : seconds(args.image_seconds, DEFAULT_IMAGE_S),
      },
      kind: isVideo ? "clip" : "still",
      assetId: asset.id,
      storagePath: asset.storage_path,
      url: asset.url,
    };
  });
}
