import { assertEquals } from "jsr:@std/assert@1";
import {
  type LoadPageAsset,
  mediaFingerprint,
  type PageAssetFile,
  withPageAssets,
} from "./page-assets.ts";
import type { LandingBlock } from "./page-content.ts";

const PICTURE = "11111111-2222-4333-8444-555555555555";
const FILM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const form = { buttonLabel: "שלחו", successMessage: "תודה" };
const folder = "landing-pages/acme/home";

/** A loader over fixed assets that counts how often each one is read. */
function fixedLoader(assets: Record<string, PageAssetFile>) {
  const reads: Array<string> = [];
  /** Reads one asset. */
  function load(id: string): ReturnType<LoadPageAsset> {
    reads.push(id);
    return Promise.resolve(assets[id] ?? { error: `missing ${id}` });
  }
  return { load, reads };
}

const picture: PageAssetFile = {
  kind: "image",
  ext: "jpg",
  bytes: new Uint8Array([1]),
};
const film: PageAssetFile = {
  kind: "video",
  ext: "mp4",
  bytes: new Uint8Array([2]),
};

Deno.test("withPageAssets", async (t) => {
  await t.step(
    "copies a hero picture and a video into the page's assets folder, each once",
    async () => {
      const { load, reads } = fixedLoader({ [PICTURE]: picture, [FILM]: film });
      const blocks: Array<LandingBlock> = [
        {
          type: "hero",
          heading: "כותרת",
          imageUrl: `asset:${PICTURE}`,
          video: { src: `asset:${FILM}`, poster: `asset:${PICTURE}` },
          form,
        },
        {
          type: "text",
          body: "גוף",
          video: { src: "site/a.mp4", poster: "site/a.jpg" },
        },
      ];
      const result = await withPageAssets(blocks, folder, load);
      assertEquals(result, {
        blocks: [
          {
            type: "hero",
            heading: "כותרת",
            imageUrl: "assets/asset-11111111222243338444555555555555.jpg",
            video: {
              src: "assets/asset-aaaaaaaabbbb4ccc8dddeeeeeeeeeeee.mp4",
              poster: "assets/asset-11111111222243338444555555555555.jpg",
            },
            form,
          },
          {
            type: "text",
            body: "גוף",
            video: { src: "site/a.mp4", poster: "site/a.jpg" },
          },
        ],
        files: {
          [`${folder}/assets/asset-11111111222243338444555555555555.jpg`]:
            picture.bytes,
          [`${folder}/assets/asset-aaaaaaaabbbb4ccc8dddeeeeeeeeeeee.mp4`]:
            film.bytes,
        },
      });
      assertEquals(reads, [FILM, PICTURE]);
    },
  );

  await t.step("a picture where a video belongs is refused", async () => {
    const { load } = fixedLoader({ [PICTURE]: picture });
    const result = await withPageAssets(
      [
        {
          type: "text",
          body: "גוף",
          video: { src: `asset:${PICTURE}`, poster: `asset:${PICTURE}` },
        },
      ],
      folder,
      load,
    );
    assertEquals("error" in result && result.error.includes("סרטון"), true);
  });

  await t.step("a page without references needs no asset", async () => {
    const { load, reads } = fixedLoader({});
    const blocks: Array<LandingBlock> = [
      {
        type: "hero",
        heading: "כותרת",
        imageUrl: "https://x.example/a.jpg",
        form,
      },
    ];
    assertEquals(await withPageAssets(blocks, folder, load), {
      blocks,
      files: {},
    });
    assertEquals(reads, []);
  });
});

Deno.test(
  "mediaFingerprint changes with the bytes and is empty without media",
  async () => {
    assertEquals(await mediaFingerprint({}), "");
    const one = await mediaFingerprint({
      "a/assets/x.png": new Uint8Array([1]),
    });
    const other = await mediaFingerprint({
      "a/assets/x.png": new Uint8Array([2]),
    });
    assertEquals(one === other, false);
  },
);
