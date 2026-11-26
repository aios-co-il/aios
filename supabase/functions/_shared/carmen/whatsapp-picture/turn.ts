/**
 * A picture sent to Carmen on WhatsApp, carried into her turn (AIO-683). The webhook hands
 * `handleCarmenMessage` a picture it has not downloaded yet; it is read only once the turn
 * is going to Carmen's brain, stored privately in the turn's org folder, passed to
 * run-ai-agent as an `attachments` path, and removed when the turn ends.
 */
import type { TurnPictureAttachment } from "../../../run-ai-agent/attachments/contract.ts";
import type { Db } from "../../workshop/db.ts";
import { WHATSAPP_PICTURES_BUCKET, whatsappPicturePath } from "./bucket.ts";
import type { PictureFetchRefusal, PictureFetchResult } from "./fetch.ts";

/** An inbound picture, not downloaded yet: `read` fetches it from the line's provider. */
export type InboundPicture = { read: () => Promise<PictureFetchResult> };

/** What the brain's request gets of the picture: the stored file, or a note that it was not read. */
export type PictureForTurn = {
  attachments: Array<TurnPictureAttachment>;
  /** Text added after the message when the picture could not be read; empty otherwise. */
  note: string;
};

/** The storage calls this module makes; the service client in production, a fake in tests. */
export interface PictureBucket {
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** The name the brain sees for the picture. */
const PICTURE_NAME = "WhatsApp picture";

/** The file endings of the picture types `sniffImageMime` accepts. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Why a picture was not read, in the words Carmen passes on. */
const NOT_READ: Record<PictureFetchRefusal | "not_stored", string> = {
  host_not_allowed:
    "it did not come from this WhatsApp line's own media server",
  download_failed: "it could not be downloaded from WhatsApp",
  too_large: "it is too large",
  not_a_picture: "it is not a JPEG, PNG, WEBP or GIF picture",
  not_stored: "it could not be saved for reading",
};

/** The `carmen-media` bucket through the service client; each call rejects on failure. */
export function whatsappPictureBucket(supabase: Db): PictureBucket {
  return {
    async upload(path, bytes, mime) {
      const { error } = await supabase.storage
        .from(WHATSAPP_PICTURES_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (error) {
        throw error;
      }
    },
    async remove(path) {
      const { error } = await supabase.storage
        .from(WHATSAPP_PICTURES_BUCKET)
        .remove([path]);
      if (error) {
        throw error;
      }
    },
  };
}

/**
 * Runs Carmen's turn with the message's picture, if it has one, and removes the stored
 * file once the turn is over, whatever its outcome: run-ai-agent's own retry reads the
 * same file, so it stays until then. A failed removal is logged with its path.
 */
export async function withInboundPicture<T>(
  bucket: PictureBucket,
  tenantId: string,
  picture: InboundPicture | null | undefined,
  run: (forTurn: PictureForTurn) => Promise<T>,
): Promise<T> {
  if (!picture) {
    return await run({ attachments: [], note: "" });
  }
  const stored = await storePicture(bucket, tenantId, picture);
  if ("refusal" in stored) {
    return await run({ attachments: [], note: notReadNote(stored.refusal) });
  }

  try {
    return await run({
      attachments: [{ type: "image", name: PICTURE_NAME, path: stored.path }],
      note: "",
    });
  } finally {
    await bucket
      .remove(stored.path)
      .catch((cause) =>
        console.error(
          `[whatsapp-picture] stored picture not removed: ${stored.path}: ${String(cause).slice(0, 200)}`,
        ),
      );
  }
}

/** The picture downloaded and stored in the org's folder, or why it was not. Never rejects. */
async function storePicture(
  bucket: PictureBucket,
  tenantId: string,
  picture: InboundPicture,
): Promise<{ path: string } | { refusal: PictureFetchRefusal | "not_stored" }> {
  const read = await picture.read().catch((cause): PictureFetchResult => {
    // The message may quote a signed address: only the error's kind is logged.
    console.warn(
      `[whatsapp-picture] read failed: ${cause instanceof Error ? cause.name : "error"}`,
    );
    return { ok: false, refusal: "download_failed" };
  });
  if (!read.ok) {
    console.warn(`[whatsapp-picture] picture not read (${read.refusal})`, {
      tenantId,
    });
    return { refusal: read.refusal };
  }
  const path = whatsappPicturePath(
    tenantId,
    `${crypto.randomUUID()}.${EXTENSIONS[read.mime]}`,
  );

  try {
    await bucket.upload(path, read.bytes, read.mime);
    return { path };
  } catch (cause) {
    console.error(
      `[whatsapp-picture] picture not stored: ${path}: ${String(cause).slice(0, 200)}`,
    );
    return { refusal: "not_stored" };
  }
}

/**
 * The fixed line for a picture that could not be read, in the shape of the site chat's
 * notes: Carmen tells the sender and never guesses what it shows.
 */
function notReadNote(refusal: PictureFetchRefusal | "not_stored"): string {
  return [
    "\n\n[Attached pictures that were not read]",
    `The sender attached a picture that you did not receive: ${NOT_READ[refusal]}. Tell them plainly that it was not read, and never guess what it shows.`,
    "[End of note]",
  ].join("\n");
}
