import { COMMAND_CENTER_FILES_BUCKET } from "../_shared/agent-channel/attachment-bucket.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type {
  ChannelAttachment,
  ChannelSessionRow,
} from "../_shared/agent-channel/types.ts";

/** The private bucket the Command Center already uses for files in a thread. */
const BUCKET = COMMAND_CENTER_FILES_BUCKET;
/** As long as the links the Command Center gives a user's own uploads. */
const READ_LINK_SECONDS = 60 * 60 * 24 * 365;
/** As many as a user may attach to one message. */
const MAX_ATTACHMENTS = 6;
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|avif)$/i;

/** Storage as this module uses it: a link to upload one file, and a link to read one. */
export interface SessionFileStore {
  uploadLink(path: string): Promise<string>;
  readLink(path: string): Promise<string>;
}

/** A file the session uploaded and named for its reply, as the tool call sends it (unvalidated). */
type AttachmentRequest = { path?: unknown; name?: unknown };

/**
 * Gives the session an upload link for one file in its own folder. The session PUTs the bytes
 * there itself, so a video never passes through this function.
 */
export async function createSessionUpload(
  store: SessionFileStore,
  session: ChannelSessionRow,
  fileName: string,
): Promise<{ path: string; upload_url: string }> {
  const path = `${sessionFolder(session)}${crypto.randomUUID()}-${safeFileName(fileName)}`;
  return { path, upload_url: await store.uploadLink(path) };
}

/**
 * Turns the files a reply names into thread attachments with read links. Only files in this
 * session's folder are accepted, so a reply cannot show another conversation's files.
 */
export async function signSessionAttachments(
  store: SessionFileStore,
  session: ChannelSessionRow,
  requested: unknown,
): Promise<Array<ChannelAttachment>> {
  if (requested == null) {
    return [];
  }
  if (!Array.isArray(requested) || requested.length > MAX_ATTACHMENTS) {
    throw new Error(`attachments must be a list of at most ${MAX_ATTACHMENTS}`);
  }
  const folder = sessionFolder(session);
  return await Promise.all(
    requested.map((item: AttachmentRequest) =>
      signAttachment(store, folder, item),
    ),
  );
}

/**
 * The attachments a reply carries. An empty list needs no session. A retry of a reply already
 * delivered signs nothing new, so ingest can return its duplicate answer even after the reply
 * completed the session; any other reply with files needs its session still running.
 */
export async function replyAttachments(args: {
  store: SessionFileStore;
  session: ChannelSessionRow | null;
  conversationId: string;
  requested: unknown;
  alreadyDelivered: () => Promise<boolean>;
}): Promise<Array<ChannelAttachment>> {
  const none =
    args.requested == null ||
    (Array.isArray(args.requested) && args.requested.length === 0);
  if (none || (await args.alreadyDelivered())) {
    return [];
  }
  return await signSessionAttachments(
    args.store,
    requireRunningSession(args.session, args.conversationId),
    args.requested,
  );
}

/** The session the call names, when it is running in the conversation the call names. */
export function requireRunningSession(
  session: ChannelSessionRow | null,
  conversationId: string,
): ChannelSessionRow {
  if (
    !session ||
    session.conversation_id !== conversationId ||
    session.status !== "running"
  ) {
    throw new Error("session_id is not a running session of this conversation");
  }
  return session;
}

/** The storage bucket behind `SessionFileStore`, through the service client. */
export function bucketFileStore(
  sb: Pick<DbClient, "storage">,
): SessionFileStore {
  function bucket() {
    return sb.storage.from(BUCKET);
  }
  return {
    async uploadLink(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data?.signedUrl) {
        throw new Error(`upload link failed: ${error?.message ?? "no URL"}`);
      }
      return data.signedUrl;
    },
    async readLink(path) {
      const { data, error } = await bucket().createSignedUrl(
        path,
        READ_LINK_SECONDS,
      );
      if (error || !data?.signedUrl) {
        throw new Error(
          `file not found or not readable: ${error?.message ?? path}`,
        );
      }
      return data.signedUrl;
    },
  };
}

/** One requested file as an attachment; throws when its path is outside the session's folder. */
async function signAttachment(
  store: SessionFileStore,
  folder: string,
  item: AttachmentRequest,
): Promise<ChannelAttachment> {
  const path = typeof item?.path === "string" ? item.path : "";
  if (!path.startsWith(folder) || path.includes("..")) {
    throw new Error(`not a file this session uploaded: ${path || "(empty)"}`);
  }
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const name =
    typeof item.name === "string" && item.name.trim()
      ? item.name.trim()
      : fileName;
  return {
    name,
    path,
    url: await store.readLink(path),
    type: IMAGE_NAME.test(fileName) ? "image" : "file",
  };
}

/** A session's files sit under its tenant and conversation, so a path names one thread. */
function sessionFolder(session: ChannelSessionRow): string {
  return `agent-replies/${session.tenant_id}/${session.conversation_id}/`;
}

/** The Command Center's own rule for stored file names: letters, digits, dot, dash, underscore. */
function safeFileName(fileName: string): string {
  // A run of dots becomes one, so the path never reads as ".." and a reply can attach it.
  return (
    fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.{2,}/g, ".") || "file"
  );
}
