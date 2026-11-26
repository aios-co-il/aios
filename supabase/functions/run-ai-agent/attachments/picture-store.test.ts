import { assertEquals } from "jsr:@std/assert@1";
import { PICTURE_BYTES } from "../../_shared/image-data-url.test-fixture.ts";
import { MAX_PICTURE_BYTES } from "./contract.ts";
import { loadTurnPictures, type PictureStore } from "./picture-store.ts";
import type { TurnPictures } from "./turn-pictures.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const wanted = { wanted: true, userId: USER };

/** A turn that accepted these stored files. */
function turnOf(...files: Array<string>): TurnPictures {
  return {
    pictures: files.map((file) => ({ name: file, path: `${USER}/${file}` })),
    dataUrls: [],
    refused: [],
  };
}

/** A store holding the given files by path, recording every download. */
function storeOf(files: Record<string, Uint8Array>) {
  const downloaded: Array<string> = [];
  const store: PictureStore = {
    sizeOf(path) {
      const bytes = files[path];
      return bytes
        ? Promise.resolve(bytes.length)
        : Promise.reject(new Error("Object not found"));
    },
    bytesOf(path) {
      downloaded.push(path);
      return Promise.resolve(files[path]);
    },
  };

  return { store, downloaded };
}

/** A file of `length` bytes that starts as a PNG does. */
function pngOf(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(PICTURE_BYTES.png);
  return bytes;
}

Deno.test("loadTurnPictures", async (t) => {
  await t.step("a stored picture becomes an inline data address", async () => {
    const { store } = storeOf({ [`${USER}/a.png`]: PICTURE_BYTES.png });

    const turn = await loadTurnPictures(store, turnOf("a.png"), wanted);

    assertEquals(turn.pictures.length, 1);
    assertEquals(turn.dataUrls.length, 1);
    assertEquals(turn.dataUrls[0].startsWith("data:image/png;base64,"), true);
    assertEquals(turn.refused, []);
  });

  await t.step("the type comes from the bytes, not the name", async () => {
    const { store } = storeOf({
      [`${USER}/photo.png`]: PICTURE_BYTES.jpeg,
      [`${USER}/invoice.png`]: PICTURE_BYTES.pdf,
    });

    const turn = await loadTurnPictures(
      store,
      turnOf("photo.png", "invoice.png"),
      wanted,
    );

    assertEquals(turn.dataUrls[0].startsWith("data:image/jpeg;base64,"), true);
    assertEquals(
      turn.pictures.map(({ name }) => name),
      ["photo.png"],
    );
    assertEquals(turn.refused, [
      { name: "invoice.png", refusal: "not_a_picture" },
    ]);
  });

  await t.step(
    "an oversize file is refused before it is downloaded",
    async () => {
      const { store, downloaded } = storeOf({
        [`${USER}/big.png`]: pngOf(MAX_PICTURE_BYTES + 1),
        [`${USER}/edge.png`]: pngOf(MAX_PICTURE_BYTES),
      });

      const turn = await loadTurnPictures(
        store,
        turnOf("big.png", "edge.png"),
        wanted,
      );

      assertEquals(turn.refused, [{ name: "big.png", refusal: "too_large" }]);
      assertEquals(
        turn.pictures.map(({ name }) => name),
        ["edge.png"],
      );
      assertEquals(downloaded, [`${USER}/edge.png`]);
    },
  );

  await t.step(
    "a file that grew after it was measured is refused",
    async () => {
      const store: PictureStore = {
        sizeOf: () => Promise.resolve(10),
        bytesOf: () => Promise.resolve(pngOf(MAX_PICTURE_BYTES + 1)),
      };

      const turn = await loadTurnPictures(store, turnOf("a.png"), wanted);

      assertEquals(turn.refused, [{ name: "a.png", refusal: "too_large" }]);
      assertEquals(turn.dataUrls, []);
    },
  );

  await t.step(
    "a missing file is refused and the rest still load",
    async () => {
      const { store } = storeOf({ [`${USER}/b.png`]: PICTURE_BYTES.png });

      const turn = await loadTurnPictures(
        store,
        turnOf("gone.png", "b.png"),
        wanted,
      );

      assertEquals(turn.refused, [{ name: "gone.png", refusal: "unreadable" }]);
      assertEquals(
        turn.pictures.map(({ name }) => name),
        ["b.png"],
      );
      assertEquals(turn.dataUrls.length, 1);
    },
  );

  await t.step("earlier refusals are kept", async () => {
    const { store } = storeOf({ [`${USER}/a.png`]: PICTURE_BYTES.png });
    const asked: TurnPictures = {
      ...turnOf("a.png"),
      refused: [{ name: "x.png", refusal: "other_folder" }],
    };

    const turn = await loadTurnPictures(store, asked, wanted);

    assertEquals(turn.refused, [{ name: "x.png", refusal: "other_folder" }]);
  });

  await t.step(
    "nothing is read when no brain of the turn can see",
    async () => {
      const { store, downloaded } = storeOf({
        [`${USER}/a.png`]: PICTURE_BYTES.png,
      });
      const asked = turnOf("a.png");

      const turn = await loadTurnPictures(store, asked, {
        wanted: false,
        userId: USER,
      });

      assertEquals(turn, asked);
      assertEquals(downloaded, []);
    },
  );
});
