/** Storage and files the workshop_import_file tests share (import-file.test.ts). */
import { fakeDb } from "./test-fakes.ts";

export const SOURCE =
  "agent-replies/tenant-1/conv-1/0b6f4a10-7a35-4c1e-9d3c-5f1d2c8b9e01-poster.png";

/** Storage that holds one file in the source bucket and records every upload. */
function fakeStorage(file: Blob | null, size = file?.size ?? 0) {
  const uploads: Array<{ bucket: string; path: string; type: string }> = [];
  const downloads: Array<string> = [];
  const removed: Array<string> = [];
  return {
    uploads,
    downloads,
    removed,
    from(bucket: string) {
      return {
        list: (folder: string, options: { search: string }) => {
          const held =
            bucket === "command-center-files" &&
            `${folder}/${options.search}` === SOURCE &&
            file;
          return Promise.resolve({
            data: held
              ? [
                  {
                    name: options.search,
                    metadata: { mimetype: file.type, size },
                  },
                ]
              : [],
            error: null,
          });
        },
        download: (path: string) => {
          downloads.push(path);
          return Promise.resolve(
            bucket === "command-center-files" && path === SOURCE && file
              ? { data: file, error: null }
              : { data: null, error: { message: "Object not found" } },
          );
        },
        remove: (paths: Array<string>) => {
          removed.push(...paths);
          return Promise.resolve({ data: [], error: null });
        },
        upload: (
          path: string,
          _body: Blob,
          options: { contentType: string },
        ) => {
          uploads.push({ bucket, path, type: options.contentType });
          return Promise.resolve({ data: { path }, error: null });
        },
      };
    },
  };
}

/** A workshop db with storage, answering reads from `script`; `size` overrides the stored size. */
export function dbWith(
  script: Record<string, unknown>,
  file: Blob | null,
  size?: number,
) {
  const storage = fakeStorage(file, size);
  return { db: Object.assign(fakeDb(script), { storage }), storage };
}

export const png = new Blob(["png"], { type: "image/png" });
export const mp4 = new Blob(["mp4"], { type: "video/mp4" });
