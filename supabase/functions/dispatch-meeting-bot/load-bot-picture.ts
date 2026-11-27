/**
 * Loads the picture the meeting bot joins with (AIO-668): the sender's copywriter Mini Me, read
 * from the web app that derives it at build time. The picture is optional: a failure here is
 * logged and the bot joins without one.
 */
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { loadMiniMeGender } from "../_shared/carmen/load-minime-gender.ts";
import type { MiniMeGender } from "../_shared/carmen/minime-gender.ts";
import { absolutePortraitUrl } from "../_shared/carmen/skin-gallery.ts";
import { meetingBotPicturePath } from "../_shared/meeting-bot/bot-picture.ts";
import type {
  CreateRecallBotOpts,
  RecallBotResponse,
} from "../_shared/recall.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { isJpeg, readPictureBytes } from "./read-picture-bytes.ts";

/** The web app is asked once; a slow answer must not hold the bot back. */
const PICTURE_TIMEOUT_MS = 3000;

interface BotPictureDeps {
  db: Pick<DbClient, "from">;
  /** The user who sends the bot; Carmen's tool may send one for nobody. */
  userId: string | null;
  /**
   * The web app's address as this environment configures it (`APP_URL`). The function fetches
   * it, so it never comes from the request: a caller must not choose where the server connects.
   */
  appUrl: string | null | undefined;
  fetch: typeof fetch;
}

/**
 * The sender's picture as Recall takes it (base64 JPEG), or null when it cannot be used.
 * Never rejects, so the handler can start it early and await it when the bot is created.
 */
export async function loadMeetingBotPicture(
  deps: BotPictureDeps,
): Promise<string | null> {
  let url: string | null = null;

  try {
    const gender = await loadMiniMeGender(deps.db, deps.userId);
    url = meetingBotPictureUrl(deps.appUrl, gender);
    if (!url) {
      throw new Error("APP_URL is not set to a web address");
    }
    // The address is ours; a redirect would let the answering host pick another one.
    const res = await deps.fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const bytes = await readPictureBytes(res);
    if (!isJpeg(bytes)) {
      throw new Error("not a JPEG");
    }
    return encodeBase64(bytes);
  } catch (err) {
    console.error(
      "[dispatch-meeting-bot] bot picture unusable, joining without it",
      url,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Creates the bot with the picture that was loading meanwhile. */
export async function createBotWithPicture(
  picture: Promise<string | null>,
  bot: Omit<CreateRecallBotOpts, "picture_jpeg_b64">,
  createBot: (opts: CreateRecallBotOpts) => Promise<RecallBotResponse>,
): Promise<RecallBotResponse> {
  return createBot({ ...bot, picture_jpeg_b64: await picture });
}

/** The full address of one set's picture on the configured web app, or null without one. */
export function meetingBotPictureUrl(
  appUrl: string | null | undefined,
  gender: MiniMeGender,
): string | null {
  if (!appUrl || !URL.canParse(appUrl)) {
    return null;
  }
  const { protocol, origin } = new URL(appUrl);
  if (protocol !== "https:" && protocol !== "http:") {
    return null;
  }
  return absolutePortraitUrl(meetingBotPicturePath(gender), origin);
}
