/**
 * Reads the accepted pictures of a turn from our own storage and turns them into the inline
 * parts a brain is sent. The bytes never leave as a link: no address is signed or fetched.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { COMMAND_CENTER_FILES_BUCKET } from "../../_shared/agent-channel/attachment-bucket.ts";
import { imageDataUrl, sniffImageMime } from "../../_shared/image-data-url.ts";
import { MAX_PICTURE_BYTES } from "./contract.ts";
import {
  type PictureRef,
  type PictureRefusal,
  type RefusedPicture,
  refusePicture,
  type TurnPictures,
} from "./turn-pictures.ts";

/** The Command Center bucket as this module reads it; both calls reject on failure. */
export interface PictureStore {
  /** The stored file's size in bytes, known before any byte is downloaded. */
  sizeOf(path: string): Promise<number>;
  bytesOf(path: string): Promise<Uint8Array>;
}

/**
 * The bucket read with the service client. Its policies give each user only their own
 * folder, and readPictureRequest has already held every path to the caller's folder.
 */
export function commandCenterPictureStore(
  supabase: Pick<SupabaseClient, "storage">,
): PictureStore {
  const bucket = supabase.storage.from(COMMAND_CENTER_FILES_BUCKET);

  return {
    async sizeOf(path) {
      const { data, error } = await bucket.info(path);
      if (error || typeof data?.size !== "number") {
        throw error ?? new Error("stored file has no size");
      }
      return data.size;
    },
    async bytesOf(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) {
        throw error ?? new Error("stored file has no body");
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

/**
 * The turn with its pictures read. Skipped when no brain of the turn can see (`wanted`
 * false), so a turn that only gets the "cannot read pictures" line downloads nothing. A
 * picture that is too large, is not a picture by its bytes or cannot be read is refused.
 */
export async function loadTurnPictures(
  store: PictureStore,
  turn: TurnPictures,
  options: { wanted: boolean; userId: string | null },
): Promise<TurnPictures> {
  if (!options.wanted || turn.pictures.length === 0) {
    return turn;
  }
  const loaded = await Promise.all(
    turn.pictures.map((picture) => loadPicture(store, picture)),
  );
  const pictures: Array<PictureRef> = [];
  const dataUrls: Array<string> = [];
  const refused: Array<RefusedPicture> = [...turn.refused];

  loaded.forEach((result, index) => {
    const picture = turn.pictures[index];
    if ("dataUrl" in result) {
      pictures.push(picture);
      dataUrls.push(result.dataUrl);
    } else {
      refused.push(
        refusePicture(picture.name, result.refusal, {
          userId: options.userId,
          path: picture.path,
          cause: result.cause,
        }),
      );
    }
  });

  return { pictures, dataUrls, refused };
}

/** One picture as a `data:` address, or why it is refused. Never rejects. */
async function loadPicture(
  store: PictureStore,
  picture: PictureRef,
): Promise<{ dataUrl: string } | { refusal: PictureRefusal; cause?: unknown }> {
  try {
    if ((await store.sizeOf(picture.path)) > MAX_PICTURE_BYTES) {
      return { refusal: "too_large" };
    }
    const bytes = await store.bytesOf(picture.path);
    // The file may have been replaced between the two reads.
    if (bytes.length > MAX_PICTURE_BYTES) {
      return { refusal: "too_large" };
    }
    const mime = sniffImageMime(bytes);

    return mime
      ? { dataUrl: imageDataUrl(bytes, mime) }
      : { refusal: "not_a_picture" };
  } catch (cause) {
    return { refusal: "unreadable", cause };
  }
}
