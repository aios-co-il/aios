import { assertEquals } from "jsr:@std/assert@1";
import {
  type LoadPageAsset,
  type PageAssetFile,
  projectAssetLoader,
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
            imageUrl: "assets/asset-111111112222.jpg",
            video: {
              src: "assets/asset-aaaaaaaabbbb.mp4",
              poster: "assets/asset-111111112222.jpg",
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
          [`${folder}/assets/asset-111111112222.jpg`]: picture.bytes,
          [`${folder}/assets/asset-aaaaaaaabbbb.mp4`]: film.bytes,
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

/** A database holding one asset row (or none) and a storage file of the given size. */
function assetDb(row: Record<string, unknown> | null, size = 3) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  const supabase = {
    from: () => query,
    storage: {
      from: () => ({
        download: () =>
          Promise.resolve({
            data: new Blob([new Uint8Array(size)]),
            error: null,
          }),
      }),
    },
  };
  return { supabase, filters };
}

Deno.test("projectAssetLoader", async (t) => {
  await t.step(
    "reads the project's own uploaded picture, keyed by org and project",
    async () => {
      const { supabase, filters } = assetDb({
        asset_type: "image",
        storage_path: "t-1/workshop/item-1/1_photo.JPEG",
      });
      const asset = await projectAssetLoader(
        supabase,
        "t-1",
        "item-1",
      )(PICTURE);
      assertEquals(asset, {
        kind: "image",
        ext: "jpg",
        bytes: new Uint8Array(3),
      });
      assertEquals(filters, [
        ["tenant_id", "t-1"],
        ["item_id", "item-1"],
        ["id", PICTURE],
      ]);
    },
  );

  await t.step("an asset of another project is not found", async () => {
    const { supabase } = assetDb(null);
    const asset = await projectAssetLoader(supabase, "t-1", "item-1")(PICTURE);
    assertEquals("error" in asset && asset.error.includes("לא נמצא"), true);
  });

  await t.step(
    "a link or a video that is not mp4 cannot go on a page",
    async () => {
      for (const row of [
        { asset_type: "link", storage_path: null },
        { asset_type: "video", storage_path: "t-1/workshop/item-1/1_clip.mov" },
      ]) {
        const { supabase } = assetDb(row);
        const asset = await projectAssetLoader(supabase, "t-1", "item-1")(FILM);
        assertEquals("error" in asset, true);
      }
    },
  );

  await t.step("a video over the repository's limit is refused", async () => {
    const { supabase } = assetDb(
      { asset_type: "video", storage_path: "t-1/workshop/item-1/1_clip.mp4" },
      15 * 1024 * 1024 + 1,
    );
    const asset = await projectAssetLoader(supabase, "t-1", "item-1")(FILM);
    assertEquals("error" in asset && asset.error.includes("גדול"), true);
  });
});
