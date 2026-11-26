/** Screenshot steps and a fake Command Center bucket, for the device-turn screenshot tests. */
import { PICTURE_BYTES } from "../../_shared/image-data-url.test-fixture.ts";
import { browserTabContextMetadata } from "../../_shared/carmen/screen-context.ts";
import type { ScreenshotStore } from "./screenshot.ts";
import { doneRow, ME, NOW, PAGE } from "./turn.test-fixture.ts";

/** The picture's file in my own folder. */
export const SHOT_PATH = `${ME}/1764150000000-tab.jpg`;

/** A tab on the act floor (mail), as the site reports it. */
export const MAIL = { origin: "https://mail.google.com", path: "/mail/u/0/" };

export const MAIL_CONTEXT = browserTabContextMetadata(
  { url: `${MAIL.origin}${MAIL.path}`, title: "Inbox" },
  NOW.toISOString(),
);

/** A done screenshot of `page` whose file is `path`, with `overrides`. */
export function shotRow(
  page: { origin: string; path: string } = PAGE,
  path = SHOT_PATH,
  overrides: Record<string, unknown> = {},
) {
  return doneRow({
    tool: "browser_screenshot",
    decision: "free",
    observed_origin: page.origin,
    observed_path: page.path,
    result: { ...page, storage_path: path },
    ...overrides,
  });
}

/** A bucket holding `files` by path, recording every read and every removal. */
export function bucketOf(
  files: Record<string, Uint8Array> = { [SHOT_PATH]: PICTURE_BYTES.png },
) {
  const read: Array<string> = [];
  const removed: Array<string> = [];
  const store: ScreenshotStore = {
    sizeOf: (path) =>
      files[path]
        ? Promise.resolve(files[path].length)
        : Promise.reject(new Error("Object not found")),
    bytesOf: (path) => {
      read.push(path);
      return Promise.resolve(files[path]);
    },
    remove: (path) => {
      removed.push(path);
      delete files[path];
      return Promise.resolve();
    },
  };
  return { store, read, removed };
}
