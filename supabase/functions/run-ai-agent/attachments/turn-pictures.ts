/** The pictures of one chat turn, as Carmen's loop carries them from the request to the brain. */
import { INLINE_IMAGE_TYPE_NAMES } from "../../_shared/image-data-url.ts";
import {
  MAX_PICTURE_MB,
  MAX_TURN_PICTURES,
  MAX_TURN_PICTURES_MB,
} from "./contract.ts";

/**
 * An accepted picture: the name the user sees, its path in their own folder and, once it is
 * read, its bytes as an inline `data:` address. A picture without one was not read: no brain
 * of the turn can see.
 */
export type TurnPicture = { name: string; path: string; dataUrl?: string };

/** Why a picture was not read, as the brain is told to pass on to the user. */
export const PICTURE_REFUSALS = {
  service_caller:
    "pictures are read only for a signed-in user writing in the site chat",
  not_a_storage_path: "it did not arrive as a file uploaded to this chat",
  other_folder: "it is not in this user's own upload folder",
  too_many: `at most ${MAX_TURN_PICTURES} pictures are read in one message`,
  too_large: `it is larger than ${MAX_PICTURE_MB}MB`,
  too_heavy: `the pictures of one message may weigh ${MAX_TURN_PICTURES_MB}MB together`,
  not_a_picture: `it is not a picture of these types: ${INLINE_IMAGE_TYPE_NAMES.join(", ")}`,
  unreadable: "its stored file could not be read",
} as const;

export type PictureRefusal = keyof typeof PICTURE_REFUSALS;

/** A picture that was not read, and why. */
export type RefusedPicture = { name: string; refusal: PictureRefusal };

export type TurnPictures = {
  /** The pictures that will be shown to a brain that can see. */
  pictures: Array<TurnPicture>;
  refused: Array<RefusedPicture>;
};

/** A turn that carries no pictures. */
export const NO_PICTURES: TurnPictures = Object.freeze({
  pictures: [],
  refused: [],
});

/**
 * The turn's pictures with a resumed browser screenshot after the user's own (AIO-656):
 * the screenshot comes already read, so it keeps its inline bytes and no file is read for it.
 */
export function withDevicePictures(
  requested: TurnPictures,
  device: TurnPictures,
): TurnPictures {
  return {
    pictures: [...requested.pictures, ...device.pictures],
    refused: [...requested.refused, ...device.refused],
  };
}

/** Whether the user attached anything to this turn, read or refused. */
export function asksForPictures(turn: TurnPictures): boolean {
  return turn.pictures.length + turn.refused.length > 0;
}

/** The most of a storage error's text the log keeps. */
const CAUSE_MAX = 200;

/**
 * Records a refused picture where the function's logs show it (work standard, rule 7) and
 * returns it for the note the user is told from. `path` is a storage path that passed the
 * caller's check, or null: what a caller sent in its place may be a signed address.
 */
export function refusePicture(
  name: string,
  refusal: PictureRefusal,
  detail: { userId: string | null; path: string | null; cause?: unknown },
): RefusedPicture {
  console.warn(
    `[AGENT] attached picture refused (${refusal}): ${JSON.stringify({
      name,
      user_id: detail.userId,
      path: detail.path,
      cause:
        detail.cause instanceof Error
          ? detail.cause.message.slice(0, CAUSE_MAX)
          : undefined,
    })}`,
  );

  return { name, refusal };
}
