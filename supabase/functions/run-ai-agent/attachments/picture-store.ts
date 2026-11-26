/**
 * Reads the accepted pictures of a turn from our own storage and turns them into the inline
 * parts a brain is sent. The bytes never leave as a link: no address is signed or fetched.
 */
import { COMMAND_CENTER_FILES_BUCKET } from "../../_shared/agent-channel/attachment-bucket.ts";
import { imageDataUrl, sniffImageMime } from "../../_shared/image-data-url.ts";
import type { Db } from "../../_shared/workshop/db.ts";
import { storedFile } from "../../_shared/workshop/tools/import-file-copy.ts";
import { MAX_PICTURE_BYTES, MAX_TURN_PICTURES_BYTES } from "./contract.ts";
import {
  type PictureRefusal,
  type RefusedPicture,
  refusePicture,
  type TurnPicture,
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
 * folder, and readPictureRequest has already held every path to the caller's folder. The
 * size comes from the folder listing the workshop's file import already reads (storedFile).
 */
export function commandCenterPictureStore(supabase: Db): PictureStore {
  return {
    async sizeOf(path) {
      const stored = await storedFile(supabase, path);
      if ("error" in stored) {
        throw new Error(stored.error);
      }
      return stored.size;
    },
    async bytesOf(path) {
      const { data, error } = await supabase.storage
        .from(COMMAND_CENTER_FILES_BUCKET)
        .download(path);
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
 * picture that is too large, takes the message past its total weight, is not a picture by
 * its bytes or cannot be read is refused. One at a time, in the user's order: the worker
 * never holds more than the total weight, and the first pictures are the ones kept. A
 * picture already read (a browser screenshot, whose file is gone by now) is kept as it is,
 * and its bytes count towards the weight.
 */
export async function loadTurnPictures(
  store: PictureStore,
  turn: TurnPictures,
  options: { wanted: boolean; userId: string | null },
): Promise<TurnPictures> {
  if (!options.wanted || turn.pictures.length === 0) {
    return turn;
  }
  const pictures: Array<TurnPicture> = [];
  const refused: Array<RefusedPicture> = [...turn.refused];
  let weight = 0;

  for (const picture of turn.pictures) {
    if (picture.dataUrl) {
      weight += inlineBytes(picture.dataUrl);
      pictures.push(picture);
      continue;
    }
    const read = await readPicture(store, picture, weight);

    if ("refusal" in read) {
      const detail = {
        userId: options.userId,
        path: picture.path,
        cause: read.cause,
      };
      refused.push(refusePicture(picture.name, read.refusal, detail));
    } else {
      weight += read.bytes.length;
      pictures.push({ ...picture, dataUrl: read.dataUrl });
    }
  }

  return { pictures, refused };
}

/** A picture's bytes and their inline address, or why it is refused. */
type PictureRead =
  | { bytes: Uint8Array; dataUrl: string }
  | { refusal: PictureRefusal; cause?: unknown };

/**
 * One picture read from the store, `weight` bytes of the message already read before it.
 * Both limits are held twice: on the stored size, so a file that breaks one is never
 * downloaded, and on the bytes, because the file may be replaced between the two reads.
 * Never rejects.
 */
async function readPicture(
  store: PictureStore,
  picture: TurnPicture,
  weight: number,
): Promise<PictureRead> {
  try {
    const measured = sizeRefusal(await store.sizeOf(picture.path), weight);
    if (measured) {
      return { refusal: measured };
    }
    const bytes = await store.bytesOf(picture.path);
    const downloaded = sizeRefusal(bytes.length, weight);
    if (downloaded) {
      return { refusal: downloaded };
    }
    const mime = sniffImageMime(bytes);

    return mime
      ? { bytes, dataUrl: imageDataUrl(bytes, mime) }
      : { refusal: "not_a_picture" };
  } catch (cause) {
    return { refusal: "unreadable", cause };
  }
}

/** About how many bytes an inline `data:` address holds: three for every four base64 characters. */
function inlineBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** Why a picture of this size is refused after `weight` bytes of pictures, if it is. */
function sizeRefusal(size: number, weight: number): PictureRefusal | null {
  // Written so that a size that is not a number is refused too.
  if (!(size <= MAX_PICTURE_BYTES)) {
    return "too_large";
  }
  return weight + size > MAX_TURN_PICTURES_BYTES ? "too_heavy" : null;
}
