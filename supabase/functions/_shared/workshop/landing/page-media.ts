/** Readers for the media a section can show: a video or a hero image, files of the pages repository. */
import type { LandingVideo } from "./page-content.ts";
import { record } from "./page-fields.ts";

// Files of the pages repository, as its schema allows them (landing-pages src/lib/content.ts).
const IMAGE_FILE =
  /^(assets|site)\/[a-z0-9][a-z0-9._-]{0,99}\.(png|jpe?g|webp|gif)$/;
const VIDEO_FILE = /^(assets|site)\/[a-z0-9][a-z0-9._-]{0,99}\.mp4$/;

/** A section's video: none, or a video file of the repository with its poster image. */
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
  if (!VIDEO_FILE.test(src) || !IMAGE_FILE.test(poster)) {
    problems.push(
      `${where}: video צריך src של קובץ mp4 ו-poster של תמונה, שניהם מתיקיית site/ או assets/`,
    );
    return {};
  }
  return { video: { src, poster } };
}

/** A hero image: none, or an image file of the repository or an https address. */
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
    !(IMAGE_FILE.test(raw) || /^https:\/\/\S{1,2000}$/.test(raw))
  ) {
    problems.push(
      `${where}: imageUrl צריך תמונה מתיקיית site/ או assets/, או כתובת https`,
    );
    return {};
  }
  return { imageUrl: raw };
}
