import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  inlineEmailImages,
  inlineImageUrlPrefixes,
  inlineImageUrls,
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

Deno.test("inlineImageUrls", async (t) => {
  await t.step("lists each storage image once, in document order", () => {
    const brand = `${prefixes[1]}t1/logo.jpg?v=2&amp;w=3`;

    assertEquals(
      inlineImageUrls(
        `<img src="${logo}"><img src='${brand}'><img src=${logo}>`,
        prefixes,
      ),
      [logo, `${prefixes[1]}t1/logo.jpg?v=2&w=3`],
    );
  });

  await t.step("skips other hosts, other buckets and svg", () => {
    const html =
      `<img src="https://evil.example/a.png">` +
      `<img src="https://x.supabase.co/storage/v1/object/public/invoices/a.png">` +
      `<img src="${prefixes[0]}t1/templates/logo.svg">`;

    assertEquals(inlineImageUrls(html, prefixes), []);
  });
});

Deno.test("inlineEmailImages", async (t) => {
  await t.step("points the chosen image at an inline attachment", () => {
    const out = inlineEmailImages(
      `<p>hi</p><img alt="logo" src="${logo}" width="230">`,
      [logo],
    );

    assertStrictEquals(
      out.html,
      `<p>hi</p><img alt="logo" src="cid:image-1" width="230">`,
    );
    assertEquals(out.attachments, [
      { filename: "image-1.png", path: logo, content_id: "image-1" },
    ]);
  });

  await t.step("rewrites quoted, single-quoted and bare sources", () => {
    const out = inlineEmailImages(
      `<img src="${logo}"><img src='${logo}'><img src=${logo}>`,
      [logo],
    );

    assertStrictEquals(
      out.html,
      `<img src="cid:image-1"><img src='cid:image-1'><img src="cid:image-1">`,
    );
    assertStrictEquals(out.attachments.length, 1);
  });

  await t.step("leaves images that were not chosen untouched", () => {
    const html = `<img src="${logo}"><img src="https://evil.example/a.png">`;

    assertEquals(inlineEmailImages(html, []), { html, attachments: [] });
  });
});
