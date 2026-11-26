import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";
import {
  MINI_ME_GENDERS,
  type MiniMeGender,
  miniMeRenderFile,
} from "../supabase/functions/_shared/carmen/minime-gender.ts";
import {
  MEETING_BOT_PICTURE_SIZE,
  MEETING_BOT_SKIN,
  meetingBotPicturePath,
} from "../supabase/functions/_shared/meeting-bot/bot-picture.ts";

/** The one source of Mini Me renders, the folder `miniMeImages.ts` bundles for the site. */
const RENDERS_DIR = "src/components/carmen/MiniMe/images";

/** The figure's width on the tile: central enough for platforms that crop the video. */
const FIGURE_SIZE = 576;

/** Behind the figure; the renders sit on white (`mini-me.css`). */
const BACKGROUND = "#ffffff";

/** Recall asks for a high-quality export (85-95). */
const JPEG_QUALITY = 90;

/**
 * At build, derives the meeting bot's picture from the Mini Me render of its skin, one per set,
 * and serves it at `meetingBotPicturePath` (AIO-668). Recall takes a 16:9 JPEG and the renders
 * are square WebP, so the picture cannot be the source file itself; deriving it here means a
 * replaced render changes the next bot's picture with no other edit. A missing render fails the
 * build.
 */
export function meetingBotPicture(): Plugin {
  let root = process.cwd();

  return {
    name: "meeting-bot-picture",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async generateBundle() {
      for (const gender of MINI_ME_GENDERS) {
        this.emitFile({
          type: "asset",
          fileName: meetingBotPicturePath(gender).replace(/^\//, ""),
          source: await renderMeetingBotPicture(
            meetingBotRenderFile(root, gender),
          ),
        });
      }
    },
  };
}

/** The source render of the meeting bot's skin in one set. */
export function meetingBotRenderFile(
  root: string,
  gender: MiniMeGender,
): string {
  return path.join(
    root,
    RENDERS_DIR,
    miniMeRenderFile(MEETING_BOT_SKIN, gender),
  );
}

/** One render as the bot's tile: the figure in its circle, as the site shows it, centred. */
export async function renderMeetingBotPicture(
  renderFile: string,
): Promise<Buffer> {
  const radius = FIGURE_SIZE / 2;
  const circle = Buffer.from(
    `<svg width="${FIGURE_SIZE}" height="${FIGURE_SIZE}"><circle cx="${radius}" cy="${radius}" r="${radius}"/></svg>`,
  );
  const figure = await sharp(await readFile(renderFile))
    .resize(FIGURE_SIZE, FIGURE_SIZE, { fit: "cover" })
    .composite([{ input: circle, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp({
    create: {
      ...MEETING_BOT_PICTURE_SIZE,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([{ input: figure }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}
