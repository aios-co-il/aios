import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { embedStorageImages } from "./embed-images.ts";
import {
  cachedImageLoader,
  downloadImage,
  MAX_INLINE_IMAGE_BYTES,
} from "./image-loader.ts";

const SB_URL = "https://x.supabase.co";
const media = `${SB_URL}/storage/v1/object/public/broadcast-media/`;
const logo = `${media}t1/templates/logo.png`;
const PIXELS = btoa("pixels");

/** A fetch that answers every request with the given response. */
function fetchReturning(response: () => Response): typeof fetch {
  return () => Promise.resolve(response());
}

/** A fetch that never answers, and fails only when its request is aborted. */
function stalled(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

Deno.test("downloadImage", async (t) => {
  await t.step("returns the image as Base64", async () => {
    const fetchImage = fetchReturning(() => new Response("pixels"));

    assertStrictEquals(await downloadImage(logo, fetchImage), PIXELS);
  });

  await t.step("gives up on a missing image", async () => {
    const fetchImage = fetchReturning(
      () => new Response("gone", { status: 404 }),
    );

    assertStrictEquals(await downloadImage(logo, fetchImage), null);
  });

  await t.step("gives up when storage stalls", async () => {
    assertStrictEquals(await downloadImage(logo, stalled, 10), null);
  });

  await t.step("stops reading a body larger than the budget", async () => {
    // A stream has no content-length, so only counting while reading stops it.
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MAX_INLINE_IMAGE_BYTES / 2 + 1));
      },
    });
    const fetchImage = fetchReturning(() => new Response(oversized));

    assertStrictEquals(await downloadImage(logo, fetchImage), null);
  });
});

Deno.test("cachedImageLoader", async (t) => {
  await t.step("downloads an image once for many emails", async () => {
    let downloads = 0;
    const load = cachedImageLoader(() => {
      downloads += 1;
      return Promise.resolve(PIXELS);
    });

    await Promise.all([load(logo), load(logo)]);
    await load(logo);

    assertStrictEquals(downloads, 1);
  });

  await t.step("keeps embedding an image deleted after download", async () => {
    const results: Array<string | null> = [PIXELS, null];
    const load = cachedImageLoader(() =>
      Promise.resolve(results.shift() ?? null),
    );
    const html = `<img src="${logo}">`;

    await embedStorageImages(html, SB_URL, load);
    const afterDelete = await embedStorageImages(html, SB_URL, load);

    assertStrictEquals(afterDelete.attachments[0].content, PIXELS);
  });

  await t.step("drops the oldest images past the cache limit", async () => {
    const other = `${media}t1/templates/other.png`;
    const downloaded: Array<string> = [];
    const load = cachedImageLoader((url) => {
      downloaded.push(url);
      return Promise.resolve(PIXELS);
    }, 6);

    await load(logo);
    await load(other);
    await load(other);
    await load(logo);

    assertEquals(downloaded, [logo, other, logo]);
  });

  await t.step("retries an image whose download failed", async () => {
    const results: Array<string | null> = [null, PIXELS];
    const load = cachedImageLoader(() =>
      Promise.resolve(results.shift() ?? null),
    );
    const html = `<img src="${logo}">`;

    const first = await embedStorageImages(html, SB_URL, load);
    const second = await embedStorageImages(html, SB_URL, load);

    assertStrictEquals(first.html, html);
    assertStrictEquals(second.html, `<img src="cid:image-1">`);
  });
});
