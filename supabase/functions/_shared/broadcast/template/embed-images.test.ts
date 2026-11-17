import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  cachedImageLoader,
  embedStorageImages,
  emailSendFields,
  MAX_INLINE_IMAGE_BYTES,
  MAX_INLINE_IMAGES,
} from "./embed-images.ts";
import { buildEmailContent } from "./email-html.ts";

const SB_URL = "https://x.supabase.co";
const media = `${SB_URL}/storage/v1/object/public/broadcast-media/`;
const logo = `${media}t1/templates/logo.png`;
const PIXELS = btoa("pixels");

/** A loader that can download only the given images. */
function loader(known: Record<string, string>) {
  return (url: string) => Promise.resolve(known[url] ?? null);
}

Deno.test("emailSendFields", async (t) => {
  await t.step("sends stored files and embedded images together", async () => {
    const file = { name: "price-list.pdf", url: `${media}t1/a/price-list.pdf` };

    assertEquals(
      await emailSendFields(
        `<img src="${logo}">`,
        [file],
        SB_URL,
        loader({ [logo]: PIXELS }),
      ),
      {
        html: `<img src="cid:image-1">`,
        attachments: [
          { filename: "price-list.pdf", path: file.url },
          {
            filename: "image-1.png",
            content: PIXELS,
            content_type: "image/png",
            content_id: "image-1",
          },
        ],
      },
    );
  });

  await t.step("embeds a bare src from a ready-made template", async () => {
    const external = `<img src=https://other.example/banner.png>`;
    const { html } = buildEmailContent({
      bodyHtml: `<img src=${logo} width=230>${external}`,
      htmlMode: true,
      vars: {},
    });

    const out = await emailSendFields(
      html,
      [],
      SB_URL,
      loader({ [logo]: PIXELS }),
    );

    assertStrictEquals(
      out.html,
      `<img src="cid:image-1" width=230>${external}`,
    );
    assertStrictEquals(out.attachments.length, 1);
  });
});

Deno.test("embedStorageImages", async (t) => {
  await t.step("keeps a missing image remote so the email sends", async () => {
    const html = `<img src="${logo}">`;

    assertEquals(await embedStorageImages(html, SB_URL, loader({})), {
      html,
      attachments: [],
    });
  });

  await t.step("sends the downloaded bytes, never a URL to fetch", async () => {
    const out = await embedStorageImages(
      `<img src="${logo}">`,
      SB_URL,
      loader({ [logo]: PIXELS }),
    );

    assertStrictEquals(out.attachments[0].content, PIXELS);
    assertStrictEquals("path" in out.attachments[0], false);
  });

  await t.step("never downloads images on other hosts", async () => {
    const downloaded: Array<string> = [];

    await embedStorageImages(
      `<img src="https://evil.example/a.png">`,
      SB_URL,
      (url) => {
        downloaded.push(url);
        return Promise.resolve(PIXELS);
      },
    );

    assertEquals(downloaded, []);
  });

  await t.step(
    "keeps an image that breaks the byte budget remote",
    async () => {
      const big = `${media}t1/templates/big.jpg`;
      const tooBig = btoa("x".repeat(MAX_INLINE_IMAGE_BYTES + 1));

      const out = await embedStorageImages(
        `<img src="${big}"><img src="${logo}">`,
        SB_URL,
        loader({ [big]: tooBig, [logo]: PIXELS }),
      );

      assertStrictEquals(out.html, `<img src="${big}"><img src="cid:image-1">`);
    },
  );

  await t.step("keeps an image remote when files leave no room", async () => {
    const html = `<img src="${logo}">`;

    assertEquals(
      await embedStorageImages(html, SB_URL, loader({ [logo]: PIXELS }), 3),
      { html, attachments: [] },
    );
  });

  await t.step("keeps images past the count limit remote", async () => {
    const urls = Array.from(
      { length: MAX_INLINE_IMAGES + 1 },
      (_, i) => `${media}t1/templates/${i}.png`,
    );

    const out = await embedStorageImages(
      urls.map((u) => `<img src="${u}">`).join(""),
      SB_URL,
      () => Promise.resolve(PIXELS),
    );

    assertStrictEquals(out.attachments.length, MAX_INLINE_IMAGES);
    assertStrictEquals(out.html.endsWith(`<img src="${urls.at(-1)}">`), true);
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
