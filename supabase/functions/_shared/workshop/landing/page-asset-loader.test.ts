import { assertEquals } from "jsr:@std/assert@1";
import { projectAssetLoader } from "./page-asset-loader.ts";

const PICTURE = "11111111-2222-4333-8444-555555555555";
const FILM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** A file of `size` bytes that starts with `head`. */
function fileOf(size: number, head: Array<number>): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(head.slice(0, size));
  return bytes;
}

/** A database holding one asset row (or none) and a storage file of the given size and start. */
function assetDb(
  row: Record<string, unknown> | null,
  size = 3,
  head: Array<number> = [0xff, 0xd8, 0xff],
) {
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
            data: new Blob([fileOf(size, head)]),
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
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      });
      assertEquals(filters, [
        ["tenant_id", "t-1"],
        ["item_id", "item-1"],
        ["id", PICTURE],
      ]);
    },
  );

  await t.step(
    "a row that names another org's file is refused before any download",
    async () => {
      const { supabase } = assetDb({
        asset_type: "image",
        storage_path: "t-2/workshop/item-9/1_photo.png",
      });
      let downloaded = false;
      supabase.storage.from = () => ({
        download: () => {
          downloaded = true;
          return Promise.resolve({ data: new Blob([]), error: null });
        },
      });
      const asset = await projectAssetLoader(
        supabase,
        "t-1",
        "item-1",
      )(PICTURE);
      assertEquals("error" in asset, true);
      assertEquals(downloaded, false);
    },
  );

  await t.step(
    "a file whose bytes are not the picture its name says is refused",
    async () => {
      const { supabase } = assetDb(
        {
          asset_type: "image",
          storage_path: "t-1/workshop/item-1/1_photo.png",
        },
        8,
        [0x3c, 0x68, 0x74, 0x6d, 0x6c],
      );
      const asset = await projectAssetLoader(
        supabase,
        "t-1",
        "item-1",
      )(PICTURE);
      assertEquals("error" in asset && asset.error.includes("png"), true);
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
