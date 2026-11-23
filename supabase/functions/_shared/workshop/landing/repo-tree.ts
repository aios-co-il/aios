/** The tree entries of a commit to the pages repository: text inline, bytes as stored blobs. */

import { encodeBase64 } from "jsr:@std/encoding@1/base64";

/** One file of a git tree: inline text, or the sha of a blob already stored. */
export type TreeEntry =
  | { path: string; mode: "100644"; type: "blob"; content: string }
  | { path: string; mode: "100644"; type: "blob"; sha: string };

/**
 * The entries for `files`. A tree entry carries text only, so a picture or a video is stored
 * first as a base64 blob (`storeBlob` returns its sha).
 */
export async function treeEntries(
  files: Record<string, string | Uint8Array>,
  storeBlob: (base64: string) => Promise<string>,
): Promise<Array<TreeEntry>> {
  const entries: Array<TreeEntry> = [];
  for (const [path, content] of Object.entries(files)) {
    entries.push(
      typeof content === "string"
        ? { path, mode: "100644", type: "blob", content }
        : {
            path,
            mode: "100644",
            type: "blob",
            sha: await storeBlob(encodeBase64(content)),
          },
    );
  }
  return entries;
}
