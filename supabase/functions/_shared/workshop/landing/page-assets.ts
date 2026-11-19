/**
 * Project assets on a page: a hero image or a video the copy names as `asset:<id>` is copied from
 * the project's assets into the page's own `assets/` folder, and the page points at that file.
 */
import { ASSET_BUCKET } from "../assets.ts";
import type { Db } from "../db.ts";
import type { LandingBlock, LandingVideo } from "./page-content.ts";
import { ASSET_REF } from "./page-media.ts";

/** The pages repository's limit for a video; a picture gets the same ceiling as an upload. */
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.mp4$/i;

type AssetKind = "image" | "video";

/** One asset's file, ready for the repository. */
export interface PageAssetFile {
  kind: AssetKind;
  /** The file's extension, lower case, without the dot. */
  ext: string;
  bytes: Uint8Array;
}

export type LoadPageAsset = (
  assetId: string,
) => Promise<PageAssetFile | { error: string }>;

/**
 * The blocks with every asset reference replaced by the page file it becomes, and those files keyed
 * by repository path. Blocks without references come back as they are, with no files.
 */
export async function withPageAssets(
  blocks: Array<LandingBlock>,
  folder: string,
  load: LoadPageAsset,
): Promise<
  | { blocks: Array<LandingBlock>; files: Record<string, Uint8Array> }
  | { error: string }
> {
  const files: Record<string, Uint8Array> = {};
  const loaded = new Map<string, PageAssetFile | { error: string }>();

  /** The page file for a reference, or the reference's problem; a plain file stays as it is. */
  async function fileFor(
    value: string,
    kind: AssetKind,
  ): Promise<string | { error: string }> {
    const id = ASSET_REF.exec(value)?.[1];
    if (!id) {
      return value;
    }
    const asset = loaded.get(id) ?? (await load(id));
    loaded.set(id, asset);
    if ("error" in asset) {
      return asset;
    }
    if (asset.kind !== kind) {
      return {
        error: `הנכס ${id} הוא ${asset.kind === "video" ? "סרטון" : "תמונה"}, ובמקום הזה צריך ${kind === "video" ? "סרטון mp4" : "תמונה"}`,
      };
    }
    const path = `assets/asset-${id.replaceAll("-", "")}.${asset.ext}`;
    files[`${folder}/${path}`] = asset.bytes;
    return path;
  }

  /** A video with both its files resolved. */
  async function videoFor(
    video: LandingVideo,
  ): Promise<LandingVideo | { error: string }> {
    const src = await fileFor(video.src, "video");
    if (typeof src !== "string") {
      return src;
    }
    const poster = await fileFor(video.poster, "image");
    return typeof poster === "string" ? { src, poster } : poster;
  }

  const resolved: Array<LandingBlock> = [];
  for (const block of blocks) {
    if (block.type !== "hero" && block.type !== "text") {
      resolved.push(block);
      continue;
    }
    const next = { ...block };
    if (block.video) {
      const video = await videoFor(block.video);
      if ("error" in video) {
        return video;
      }
      next.video = video;
    }
    if (next.type === "hero" && next.imageUrl) {
      const image = await fileFor(next.imageUrl, "image");
      if (typeof image !== "string") {
        return image;
      }
      next.imageUrl = image;
    }
    resolved.push(next);
  }
  return { blocks: resolved, files };
}

/**
 * A fingerprint of the copied files' bytes, empty when there are none. The build digest includes
 * it, so a publish ships exactly the media of the preview the user approved, even if an asset's
 * stored file changes under the same id.
 */
export async function mediaFingerprint(
  files: Record<string, Uint8Array>,
): Promise<string> {
  const lines = [];
  for (const path of Object.keys(files).sort()) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      files[path] as Uint8Array<ArrayBuffer>,
    );
    const hex = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    lines.push(`\n${path} ${hex}`);
  }
  return lines.join("");
}

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
