/** The pictures of one chat turn, as Carmen's loop carries them from the request to the brain. */
import { MAX_PICTURE_MB, MAX_TURN_PICTURES } from "./contract.ts";

/** An accepted picture: the name the user sees and its path in their own folder. */
export type PictureRef = { name: string; path: string };

/** Why a picture was not read, as the brain is told to pass on to the user. */
export const PICTURE_REFUSALS = {
  service_caller:
    "pictures are read only for a signed-in user writing in the site chat",
  not_a_storage_path: "it did not arrive as a file uploaded to this chat",
  other_folder: "it is not in this user's own upload folder",
  too_many: `at most ${MAX_TURN_PICTURES} pictures are read in one message`,
  too_large: `it is larger than ${MAX_PICTURE_MB}MB`,
  not_a_picture: "it is not a JPEG, PNG, WEBP or GIF picture",
  unreadable: "its stored file could not be read",
} as const;

export type PictureRefusal = keyof typeof PICTURE_REFUSALS;

/** A picture that was not read, and why. */
export type RefusedPicture = { name: string; refusal: PictureRefusal };

export type TurnPictures = {
  /** The pictures that will be shown to a brain that can see. */
  pictures: Array<PictureRef>;
  /**
   * Their bytes as inline `data:` addresses, in the same order. Empty until they are read,
   * and when no brain of the turn can see.
   */
  dataUrls: Array<string>;
  refused: Array<RefusedPicture>;
};

/** A turn that carries no pictures. */
export const NO_PICTURES: TurnPictures = Object.freeze({
  pictures: [],
  dataUrls: [],
  refused: [],
});

/** Whether the user attached anything to this turn, read or refused. */
export function asksForPictures(turn: TurnPictures): boolean {
  return turn.pictures.length + turn.refused.length > 0;
}

/**
 * Records a refused picture where the function's logs show it (work standard, rule 7) and
 * returns it for the note the user is told from.
 */
export function refusePicture(
  name: string,
  refusal: PictureRefusal,
  detail: { userId: string | null; path?: unknown; cause?: unknown },
): RefusedPicture {
  console.warn(
    `[AGENT] attached picture refused (${refusal}): ${JSON.stringify({
      name,
      user_id: detail.userId,
      path: typeof detail.path === "string" ? detail.path.slice(0, 200) : null,
      cause: detail.cause instanceof Error ? detail.cause.message : undefined,
    })}`,
  );

  return { name, refusal };
}
