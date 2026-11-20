/**
 * Readers for the media a section can show: a video or a hero image. Each is a file of the pages
 * repository, or a project asset (`asset:<id>`) that the build copies into the page's folder.
 */
import type { LandingVideo } from "./page-content.ts";
import { record } from "./page-fields.ts";

// Files of the pages repository, as its schema allows them (landing-pages src/lib/content.ts).
const IMAGE_FILE =
  /^(assets|site)\/[a-z0-9][a-z0-9._-]{0,99}\.(png|jpe?g|webp|gif)$/;
const VIDEO_FILE = /^(assets|site)\/[a-z0-9][a-z0-9._-]{0,99}\.mp4$/;

/** A project asset named in the copy; the build replaces it with the file it copies. */
export const ASSET_REF =
  /^asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** An image the page can show: a repository file or a project asset. */
function imageSource(value: string): boolean {
  return IMAGE_FILE.test(value) || ASSET_REF.test(value);
}

/** A video the page can show: a repository mp4 or a project asset. */
function videoSource(value: string): boolean {
  return VIDEO_FILE.test(value) || ASSET_REF.test(value);
}

/** A section's video: none, or a video with its poster image, each a repository file or an asset. */
export function video(
  source: Record<string, unknown>,
  where: string,
  problems: Array<string>,
): { video?: LandingVideo } {
  if (source.video === undefined || source.video === null) {
    return {};
  }
  const raw = record(source.video);
  const src = typeof raw.src === "string" ? raw.src : "";
  const poster = typeof raw.poster === "string" ? raw.poster : "";
  if (!videoSource(src) || !imageSource(poster)) {
    problems.push(
      `${where}: video צריך src של סרטון mp4 ו-poster של תמונה: נכס מהפרויקט (asset:<id>) או קובץ מתיקיית site/ או assets/`,
    );
    return {};
  }
  return { video: { src, poster } };
}

/** A hero image: none, or an image file of the repository, a project asset or an https address. */
export function imageUrl(
  source: Record<string, unknown>,
  where: string,
  problems: Array<string>,
): { imageUrl?: string } {
  const raw = source.imageUrl;
  if (raw === undefined || raw === null || raw === "") {
    return {};
  }
  if (
    typeof raw !== "string" ||
    !(imageSource(raw) || /^https:\/\/\S{1,2000}$/.test(raw))
  ) {
    problems.push(
      `${where}: imageUrl צריך תמונה: נכס מהפרויקט (asset:<id>), קובץ מתיקיית site/ או assets/, או כתובת https`,
    );
    return {};
  }
  return { imageUrl: raw };
}
