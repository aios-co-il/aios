/** Reads a project's uploaded picture or video for its landing page (`page-assets.ts` places it). */
import { ASSET_BUCKET } from "../assets.ts";
import type { Db } from "../db.ts";
import type { AssetKind, LoadPageAsset } from "./page-assets.ts";

/** The pages repository's limit for a video; a picture gets the same ceiling as an upload. */
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.mp4$/i;

/**
 * Loads a project's asset for its page: only a file uploaded to this project (tenant and project
 * keyed), an image or an mp4 video within the repository's size limits.
 */
export function projectAssetLoader(
  supabase: Db,
  tenantId: string,
  itemId: string,
): LoadPageAsset {
  return async (assetId) => {
    const { data, error } = await supabase
      .from("workshop_assets")
      .select("asset_type, storage_path")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("id", assetId)
      .maybeSingle();
    if (error) {
      throw new Error(`asset ${assetId} not read: ${error.message}`);
    }
    if (!data) {
      return { error: `הנכס ${assetId} לא נמצא בנכסי הפרויקט` };
    }
    const path = typeof data.storage_path === "string" ? data.storage_path : "";
    // The download runs as the service role, past storage's own policies: a row may only name an
    // object in this org's folder, never another org's file.
    if (path && path.split("/")[0] !== tenantId) {
      console.error(
        `landing assets: asset ${assetId} names a file outside org ${tenantId}`,
      );
      return { error: `הנכס ${assetId} לא שייך לחשבון הזה` };
    }
    const kind = kindOf(data.asset_type, path);
    if (!path || !kind) {
      return {
        error: `הנכס ${assetId} צריך להיות תמונה או סרטון mp4 שהועלו לנכסי הפרויקט`,
      };
    }
    const file = await supabase.storage.from(ASSET_BUCKET).download(path);
    if (file.error || !file.data) {
      throw new Error(
        `asset ${assetId} not downloaded: ${file.error?.message ?? "no data"}`,
      );
    }
    const bytes = new Uint8Array(await (file.data as Blob).arrayBuffer());
    const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (bytes.byteLength > limit) {
      return {
        error: `הנכס ${assetId} גדול מדי לעמוד (עד ${limit / 1024 / 1024}MB)`,
      };
    }
    const ext = (path.split(".").pop() ?? "").toLowerCase();
    return { kind, ext: ext === "jpeg" ? "jpg" : ext, bytes };
  };
}

/** An asset's kind on a page, by its type and its file's extension; null when a page cannot show it. */
function kindOf(assetType: unknown, path: string): AssetKind | null {
  if (assetType === "image" && IMAGE_EXT.test(path)) {
    return "image";
  }
  if (assetType === "video" && VIDEO_EXT.test(path)) {
    return "video";
  }
  return null;
}
