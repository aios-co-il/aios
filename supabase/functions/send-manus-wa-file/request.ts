// The body of a send-manus-wa-file call: JSON with a media URL (broadcasts)
// or multipart with the file itself (report screenshots and documents from
// the browser, which have no public URL).

export type MediaSource =
  | {
      kind: "url";
      url: string;
      isImage: boolean;
      mimeType: string;
      filename: string | null;
    }
  | { kind: "upload"; file: File; isImage: boolean };

export type FileSendRequest = {
  clientId: string | null;
  leadId: string | null;
  groupId: string | null;
  phoneNumber: string | null;
  tenantId: string | null;
  integrationId: string | null;
  senderUserId: string | null;
  caption: string;
  captionFallback: boolean;
  sendKind: unknown;
  sendRef: unknown;
  media: MediaSource;
};

type Fields = (key: string) => unknown;

/** Reads either body shape into one request, or says what is missing. */
export async function readFileSendRequest(
  req: Request,
): Promise<FileSendRequest | { error: string }> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "No file provided" };
    }
    const isImage =
      form.get("fileType") === "image" || file.type.startsWith("image/");
    return buildRequest((key) => form.get(key), {
      kind: "upload",
      file,
      isImage,
    });
  }
  const body: unknown = await req.json();
  const fields: Fields = (key) =>
    body && typeof body === "object" ? Reflect.get(body, key) : undefined;
  const imageUrl = text(fields("imageUrl"));
  const url = imageUrl || text(fields("fileUrl"));
  if (!url) {
    return { error: "Missing fileUrl or imageUrl" };
  }
  const mimeType = text(fields("mimeType")) || "application/octet-stream";
  return buildRequest(fields, {
    kind: "url",
    url,
    isImage: !!imageUrl || mimeType.startsWith("image/"),
    mimeType,
    filename: text(fields("filename")),
  });
}

/** The common fields, whichever body shape carried them. */
function buildRequest(fields: Fields, media: MediaSource): FileSendRequest {
  return {
    clientId: text(fields("clientId")),
    leadId: text(fields("leadId")),
    groupId: text(fields("groupId")),
    phoneNumber: text(fields("phoneNumber")),
    tenantId: text(fields("tenantId")),
    integrationId: text(fields("integrationId")),
    senderUserId: text(fields("senderUserId")),
    caption: raw(fields("caption")),
    captionFallback: flag(fields("captionFallback")),
    sendKind: fields("sendKind"),
    sendRef: fields("sendRef"),
    media,
  };
}

/** A trimmed non-empty string, else null. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The string as sent (captions keep their line breaks), else "". */
function raw(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** true for a JSON true or a form "true". */
function flag(value: unknown): boolean {
  return value === true || value === "true";
}
