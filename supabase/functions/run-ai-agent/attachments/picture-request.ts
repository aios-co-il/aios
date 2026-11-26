/**
 * Reads the unvalidated `attachments` of a run-ai-agent request. A picture is accepted only
 * as a storage path, never an address, so nothing outside our storage can be named here, and
 * by one of two separate rules: a signed-in user's own folder of the Command Center bucket,
 * or, for the WhatsApp webhooks' service call (AIO-683), the turn's own org folder for
 * WhatsApp pictures. The service caller is trusted; the path it sends is still checked.
 */
import { COMMAND_CENTER_FILES_BUCKET } from "../../_shared/agent-channel/attachment-bucket.ts";
import {
  WHATSAPP_PICTURES_BUCKET,
  WHATSAPP_PICTURES_FOLDER,
} from "../../_shared/carmen/whatsapp-picture/bucket.ts";
import {
  oneLine,
  withoutFormatCharacters,
} from "../../_shared/carmen/screen-context.ts";
import { MAX_PICTURE_BYTES, MAX_TURN_PICTURES } from "./contract.ts";
import {
  NO_PICTURES,
  type PictureRefusal,
  type RefusedPicture,
  refusePicture,
  type TurnPicture,
  type TurnPictures,
} from "./turn-pictures.ts";

/** Who sent the request, as run-ai-agent already resolved them. */
export type PictureCaller = {
  /** How the request was authenticated (requireAuth). */
  authKind?: string;
  /** The signed-in user (bindRunAgentCaller sets it from the JWT). */
  userId: string | null;
  /** The request's surface, as run-ai-agent resolved it (a user JWT is never `whatsapp`). */
  surface?: string;
  /** The org the turn runs in, as run-ai-agent resolved it. */
  tenantId?: string | null;
};

/** Entries past this are counted, not read: a flood of them costs one log line. */
const MAX_ENTRIES_READ = 12;
/** The most of a file's name that is quoted, in characters. */
const NAME_MAX = 80;
/**
 * `<user id>/<file name>`: exactly what the chat's upload writes. Nothing that reads as an
 * address fits it: no scheme, no leading slash, no backslash, no second folder.
 */
const OWN_FILE = /^([0-9a-f-]{36})\/([A-Za-z0-9._-]{1,300})$/i;
/**
 * `whatsapp-inbound/<tenant id>/<file name>`: exactly what the WhatsApp webhooks write
 * (`whatsappPicturePath`), with nothing that reads as an address or climbs a folder.
 */
const ORG_WHATSAPP_FILE = new RegExp(
  `^${WHATSAPP_PICTURES_FOLDER}/([0-9a-f-]{36})/([A-Za-z0-9._-]{1,300})$`,
  "i",
);

/**
 * The bucket the accepted pictures of this caller are read from: the WhatsApp pictures'
 * bucket for the webhooks' service call, the Command Center bucket for everyone else.
 */
export function pictureBucketOf(caller: PictureCaller): string {
  return isWhatsappService(caller)
    ? WHATSAPP_PICTURES_BUCKET
    : COMMAND_CENTER_FILES_BUCKET;
}

/** The pictures this request may show a brain, and the ones refused with the reason. */
export function readPictureRequest(
  raw: unknown,
  caller: PictureCaller,
): TurnPictures {
  if (raw === undefined || raw === null) {
    return NO_PICTURES;
  }
  const entries = Array.isArray(raw) ? raw : [raw];
  const pictures: Array<TurnPicture> = [];
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
        path: null,
      }),
    );
  }

  return { pictures, refused };
}

/** The path of the caller's own picture this entry names, or why it may not be read. */
function checkEntry(
  entry: unknown,
  caller: PictureCaller,
): PictureRefusal | { path: string } {
  if (isWhatsappService(caller)) {
    return checkOrgEntry(entry, caller.tenantId);
  }
  if (caller.authKind !== "user" || !caller.userId) {
    return "service_caller";
  }
  if (!isObject(entry) || "url" in entry || !hasPath(entry)) {
    return "not_a_storage_path";
  }
  const file = OWN_FILE.exec(entry.path);

  if (!file || file[2] === "." || file[2] === "..") {
    return "not_a_storage_path";
  }
  // Exactly as signed: storage names are case sensitive, and so are its folder policies.
  if (file[1] !== caller.userId) {
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

/**
 * The WhatsApp webhooks' rule: a picture they stored for this turn, in the turn's own org
 * folder of the WhatsApp pictures' bucket. A path in another org's folder is refused even
 * though the caller is the service: the path came with the request.
 */
function checkOrgEntry(
  entry: unknown,
  tenantId: string,
): PictureRefusal | { path: string } {
  if (!isObject(entry) || "url" in entry || !hasPath(entry)) {
    return "not_a_storage_path";
  }
  const file = ORG_WHATSAPP_FILE.exec(entry.path);

  if (!file || file[2] === "." || file[2] === "..") {
    return "not_a_storage_path";
  }
  if (file[1] !== tenantId) {
    return "other_folder";
  }
  if (!("type" in entry) || entry.type !== "image") {
    return "not_a_picture";
  }
  return { path: entry.path };
}

/**
 * Whether this is the WhatsApp webhooks' service call (runCarmenAI in `_shared/carmen.ts`):
 * the service key, the whatsapp surface (which a user JWT never keeps) and a known org.
 */
function isWhatsappService(
  caller: PictureCaller,
): caller is PictureCaller & { tenantId: string } {
  return (
    caller.authKind === "service" &&
    caller.surface === "whatsapp" &&
    typeof caller.tenantId === "string" &&
    caller.tenantId !== ""
  );
}

/**
 * The name the user gave the file, safe to quote in a prompt and a log line: one line, no
 * square brackets (the notes about pictures open and close with them), cut between
 * characters so half an emoji never reaches a provider.
 */
function pictureName(entry: unknown): string {
  const given =
    isObject(entry) && "name" in entry && typeof entry.name === "string"
      ? entry.name
      : "";
  const clean = oneLine(withoutFormatCharacters(given).replace(/[[\]]/g, ""));

  return Array.from(clean).slice(0, NAME_MAX).join("") || "picture";
}

/** What the log keeps of a refused entry: its path only when it is a path in the bucket. */
function refusalDetail(entry: unknown, caller: PictureCaller) {
  const pattern = isWhatsappService(caller) ? ORG_WHATSAPP_FILE : OWN_FILE;
  const isStoragePath =
    isObject(entry) && hasPath(entry) && pattern.test(entry.path);

  return {
    userId: caller.userId,
    path: isStoragePath ? entry.path : null,
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
