/**
 * Loads the picture the meeting bot joins with (AIO-668): the sender's copywriter Mini Me, read
 * from the web app that derives it at build time. The picture is optional: a failure here is
 * logged and the bot joins without one.
 */
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { toAddressGender } from "../_shared/carmen/address-gender.ts";
import {
  type MiniMeGender,
  resolveMiniMeGender,
} from "../_shared/carmen/minime-gender.ts";
import { absolutePortraitUrl } from "../_shared/carmen/skin-gallery.ts";
import { meetingBotPicturePath } from "../_shared/meeting-bot/bot-picture.ts";
import { RECALL_JPEG_B64_MAX_LENGTH } from "../_shared/recall.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The web app is asked once; a slow answer must not hold the bot back. */
const PICTURE_TIMEOUT_MS = 5000;

/** Every JPEG file starts with these bytes (the SOI marker and the next marker's prefix). */
const JPEG_START = [0xff, 0xd8, 0xff];

interface BotPictureDeps {
  db: Pick<DbClient, "from">;
  /** The user who sends the bot; Carmen's tool may send one for nobody. */
  userId: string | null;
  /** The web app's origin for this environment (`appOrigin`). */
  origin: string;
  fetch: typeof fetch;
}

/** The sender's picture as Recall takes it (base64 JPEG), or null when it cannot be used. */
export async function loadMeetingBotPicture(
  deps: BotPictureDeps,
): Promise<string | null> {
  const gender = await senderMiniMeGender(deps.db, deps.userId);
  const url = meetingBotPictureUrl(deps.origin, gender);

  try {
    const res = await deps.fetch(url, {
      signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const problem = recallJpegProblem(bytes);
    if (problem) {
      throw new Error(problem);
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

/** The full address of one set's picture on the web app. */
export function meetingBotPictureUrl(
  origin: string,
  gender: MiniMeGender,
): string {
  return absolutePortraitUrl(meetingBotPicturePath(gender), origin);
}

/** Why Recall would refuse these bytes as a video output, or null when they fit. */
export function recallJpegProblem(bytes: Uint8Array): string | null {
  if (!JPEG_START.every((byte, i) => bytes[i] === byte)) {
    return "not a JPEG";
  }
  // Base64 writes every 3 bytes as 4 characters.
  const b64Length = Math.ceil(bytes.length / 3) * 4;
  if (b64Length > RECALL_JPEG_B64_MAX_LENGTH) {
    return `too large for Recall (${bytes.length} bytes)`;
  }
  return null;
}

/** The sender's Mini Me set by the site's rule; male for no sender or an unreadable profile. */
export async function senderMiniMeGender(
  db: Pick<DbClient, "from">,
  userId: string | null,
): Promise<MiniMeGender> {
  if (!userId) {
    return resolveMiniMeGender(null, null);
  }
  const { data, error } = await db
    .from("profiles")
    .select("minime_gender, gender")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      "[dispatch-meeting-bot] sender profile lookup failed",
      error.message,
    );
  }
  return resolveMiniMeGender(
    data?.minime_gender,
    toAddressGender(data?.gender),
  );
}
