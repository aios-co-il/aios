/**
 * Project assets on a page: a hero image or a video the copy names as `asset:<id>` is copied from
 * the project's assets into the page's own `assets/` folder, and the page points at that file.
 */
import type { LandingBlock, LandingVideo } from "./page-content.ts";
import { ASSET_REF } from "./page-media.ts";

export type AssetKind = "image" | "video";

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
