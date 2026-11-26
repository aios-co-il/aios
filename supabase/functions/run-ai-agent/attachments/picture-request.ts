/**
 * Reads the unvalidated `attachments` of a run-ai-agent request. A picture is accepted only
 * as a storage path inside the caller's own folder of the Command Center bucket: the server
 * never takes an address, so nothing outside our storage can be named here.
 */
import {
  oneLine,
  withoutFormatCharacters,
} from "../../_shared/carmen/screen-context.ts";
import { MAX_PICTURE_BYTES, MAX_TURN_PICTURES } from "./contract.ts";
import {
  NO_PICTURES,
  type PictureRef,
  type PictureRefusal,
  type RefusedPicture,
  refusePicture,
  type TurnPictures,
} from "./turn-pictures.ts";

/** Who sent the request, as run-ai-agent already resolved them. */
export type PictureCaller = {
  /** How the request was authenticated (requireAuth). */
  authKind?: string;
  /** The signed-in user (bindRunAgentCaller sets it from the JWT). */
  userId: string | null;
};

/** The chat attaches at most six files; entries past this are counted, not read. */
const MAX_ENTRIES_READ = 12;
const NAME_MAX = 80;
/** `<user id>/<file name>`: exactly what the chat's upload writes. */
const OWN_FILE = /^([0-9a-f-]{36})\/([A-Za-z0-9._-]{1,300})$/i;
/** Anything that reads as an address rather than a path in the bucket. */
const ADDRESS = /^[a-z][a-z0-9+.-]*:|^\/|\\/i;

/** The pictures this request may show a brain, and the ones refused with the reason. */
export function readPictureRequest(
  raw: unknown,
  caller: PictureCaller,
): TurnPictures {
  if (raw === undefined || raw === null) {
    return NO_PICTURES;
  }
  const entries = Array.isArray(raw) ? raw : [raw];
  const pictures: Array<PictureRef> = [];
  const refused: Array<RefusedPicture> = [];

  for (const entry of entries.slice(0, MAX_ENTRIES_READ)) {
    const name = pictureName(entry);
    const checked = checkEntry(entry, caller);
    const full = pictures.length >= MAX_TURN_PICTURES;

    if (typeof checked === "string" || full) {
      const refusal = typeof checked === "string" ? checked : "too_many";
      refused.push(refusePicture(name, refusal, refusalDetail(entry, caller)));
    } else {
      pictures.push({ name, path: checked.path });
    }
  }
  const unread = entries.length - MAX_ENTRIES_READ;
  if (unread > 0) {
    refused.push(
      refusePicture(`${unread} more files`, "too_many", {
        userId: caller.userId,
      }),
    );
  }

  return { pictures, dataUrls: [], refused };
}

/** The path of the caller's own picture this entry names, or why it may not be read. */
function checkEntry(
  entry: unknown,
  caller: PictureCaller,
): PictureRefusal | { path: string } {
  if (caller.authKind !== "user" || !caller.userId) {
    return "service_caller";
  }
  if (!isObject(entry) || "url" in entry || !hasPath(entry)) {
    return "not_a_storage_path";
  }
  const file = ADDRESS.test(entry.path) ? null : OWN_FILE.exec(entry.path);

  if (!file || file[2] === "." || file[2] === "..") {
    return "not_a_storage_path";
  }
  if (file[1].toLowerCase() !== caller.userId.toLowerCase()) {
    return "other_folder";
  }
  if (!("type" in entry) || entry.type !== "image") {
    return "not_a_picture";
  }
  // The size the browser reports only saves a download; the stored file is measured too.
  const tooLarge =
    "size" in entry &&
    typeof entry.size === "number" &&
    entry.size > MAX_PICTURE_BYTES;

  return tooLarge ? "too_large" : { path: entry.path };
}

/** The name the user gave the file, safe to quote in a prompt and a log line. */
function pictureName(entry: unknown): string {
  const name =
    isObject(entry) && "name" in entry && typeof entry.name === "string"
      ? oneLine(withoutFormatCharacters(entry.name)).slice(0, NAME_MAX)
      : "";

  return name || "picture";
}

/** What the log keeps of a refused entry. */
function refusalDetail(entry: unknown, caller: PictureCaller) {
  return {
    userId: caller.userId,
    path: isObject(entry) && "path" in entry ? entry.path : undefined,
  };
}

/** Narrows an unvalidated value to an object whose keys can be tested. */
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Whether the entry carries a non-empty text path. */
function hasPath(entry: object): entry is { path: string } {
  return "path" in entry && typeof entry.path === "string" && entry.path !== "";
}
