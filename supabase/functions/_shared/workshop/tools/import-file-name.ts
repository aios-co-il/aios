/** Names and types of the files workshop_import_file brings in (import-file.ts). */

/** What a direct brain can put on a board. */
export const KINDS = ["image", "clip", "film"] as const;
export type ImportKind = (typeof KINDS)[number];

/** A workshop_import_file call, checked. */
export interface ImportRequest {
  itemId: string;
  kind: ImportKind;
  source: string;
  title: string;
  sceneId: string;
}

/** Types a file name's extension stands for, when the upload carried no type of its own. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * The file's type: the one stored with the upload, or else its extension's. An agent that PUT the
 * bytes without a Content-Type leaves a generic type, and a good file would be refused for it.
 */
export function fileType(storedType: string, path: string): string {
  if (storedType && storedType !== "application/octet-stream") {
    return storedType;
  }
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return TYPE_BY_EXTENSION[extension] ?? storedType;
}

/** The file's own name: the last path segment without the upload's random prefix. */
export function fileNameOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/^[0-9a-f-]{36}-/, "") || "file";
}
