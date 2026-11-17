import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  embedStorageImages,
  emailSendFields,
  MAX_INLINE_IMAGE_BYTES,
  MAX_INLINE_IMAGES,
} from "./embed-images.ts";

const SB_URL = "https://x.supabase.co";
const media = `${SB_URL}/storage/v1/object/public/broadcast-media/`;
const logo = `${media}t1/templates/logo.png`;

/** A size lookup that knows only the given images. */
function sizes(known: Record<string, number>) {
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
        sizes({ [logo]: 9000 }),
      ),
      {
        html: `<img src="cid:image-1">`,
        attachments: [
          { filename: "price-list.pdf", path: file.url },
          { filename: "image-1.png", path: logo, content_id: "image-1" },
        ],
      },
    );
  });
});

Deno.test("embedStorageImages", async (t) => {
  await t.step(
    "keeps a missing image remote so the email still sends",
    async () => {
      const html = `<img src="${logo}">`;

      assertEquals(await embedStorageImages(html, SB_URL, sizes({})), {
        html,
        attachments: [],
      });
    },
  );

  await t.step("never looks up images on other hosts", async () => {
    const html = `<img src="https://evil.example/a.png">`;
    const lookedUp: Array<string> = [];

    await embedStorageImages(html, SB_URL, (url) => {
      lookedUp.push(url);
      return Promise.resolve(1);
    });

    assertEquals(lookedUp, []);
  });

  await t.step(
    "keeps an image that breaks the byte budget remote",
    async () => {
      const big = `${media}t1/templates/big.jpg`;
      const out = await embedStorageImages(
        `<img src="${big}"><img src="${logo}">`,
        SB_URL,
        sizes({ [big]: MAX_INLINE_IMAGE_BYTES + 1, [logo]: 9000 }),
      );

      assertStrictEquals(out.html, `<img src="${big}"><img src="cid:image-1">`);
    },
  );

  await t.step("keeps images past the count limit remote", async () => {
    const urls = Array.from(
      { length: MAX_INLINE_IMAGES + 1 },
      (_, i) => `${media}t1/templates/${i}.png`,
    );
    const out = await embedStorageImages(
      urls.map((u) => `<img src="${u}">`).join(""),
      SB_URL,
      () => Promise.resolve(10),
    );

    assertStrictEquals(out.attachments.length, MAX_INLINE_IMAGES);
    assertStrictEquals(out.html.endsWith(`<img src="${urls.at(-1)}">`), true);
  });
});
