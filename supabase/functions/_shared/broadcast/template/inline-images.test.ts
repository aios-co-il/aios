import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  emailSendFields,
  inlineEmailImages,
  inlineImageUrlPrefixes,
  MAX_INLINE_IMAGES,
} from "./inline-images.ts";

const prefixes = inlineImageUrlPrefixes("https://x.supabase.co/");
const logo = `${prefixes[0]}t1/templates/logo.PNG`;

Deno.test("inlineImageUrlPrefixes", async (t) => {
  await t.step("covers template images and brand logos", () => {
    assertEquals(prefixes, [
      "https://x.supabase.co/storage/v1/object/public/broadcast-media/",
      "https://x.supabase.co/storage/v1/object/public/tenant-logos/",
    ]);
  });
});

Deno.test("emailSendFields", async (t) => {
  await t.step("sends stored files and embedded images together", () => {
    const file = {
      name: "price-list.pdf",
      url: `${prefixes[0]}t1/attachments/price-list.pdf`,
    };

    assertEquals(
      emailSendFields(`<img src="${logo}">`, [file], "https://x.supabase.co"),
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

Deno.test("inlineEmailImages", async (t) => {
  await t.step("embeds an image served from our storage", () => {
    const out = inlineEmailImages(
      `<p>hi</p><img alt="logo" src="${logo}" width="230">`,
      prefixes,
    );

    assertStrictEquals(
      out.html,
      `<p>hi</p><img alt="logo" src="cid:image-1" width="230">`,
    );
    assertEquals(out.attachments, [
      { filename: "image-1.png", path: logo, content_id: "image-1" },
    ]);
  });

  await t.step("attaches an image used twice only once", () => {
    const out = inlineEmailImages(
      `<img src="${logo}"><img src='${logo}'>`,
      prefixes,
    );

    assertStrictEquals(
      out.html,
      `<img src="cid:image-1"><img src='cid:image-1'>`,
    );
    assertStrictEquals(out.attachments.length, 1);
  });

  await t.step("leaves images on other hosts as remote links", () => {
    const html =
      `<img src="https://evil.example/a.png">` +
      `<img src="https://x.supabase.co/storage/v1/object/public/invoices/a.png">`;

    assertEquals(inlineEmailImages(html, prefixes), { html, attachments: [] });
  });

  await t.step("leaves formats mail clients do not render inline", () => {
    const html = `<img src="${prefixes[0]}t1/templates/logo.svg">`;

    assertEquals(inlineEmailImages(html, prefixes), { html, attachments: [] });
  });

  await t.step("numbers each distinct image and keeps the brand logo", () => {
    const brand = `${prefixes[1]}t1/logo.jpg?v=2`;
    const out = inlineEmailImages(
      `<img src="${logo}"><img src="${brand}">`,
      prefixes,
    );

    assertStrictEquals(
      out.html,
      `<img src="cid:image-1"><img src="cid:image-2">`,
    );
    assertEquals(out.attachments[1], {
      filename: "image-2.jpg",
      path: brand,
      content_id: "image-2",
    });
  });

  await t.step("keeps images past the limit remote", () => {
    const urls = Array.from(
      { length: MAX_INLINE_IMAGES + 1 },
      (_, i) => `${prefixes[0]}t1/templates/${i}.png`,
    );
    const out = inlineEmailImages(
      urls.map((u) => `<img src="${u}">`).join(""),
      prefixes,
    );

    assertStrictEquals(out.attachments.length, MAX_INLINE_IMAGES);
    assertStrictEquals(out.html.endsWith(`<img src="${urls.at(-1)}">`), true);
  });

  await t.step("returns HTML without images unchanged", () => {
    assertEquals(inlineEmailImages("<p>hi</p>", prefixes), {
      html: "<p>hi</p>",
      attachments: [],
    });
  });
});
