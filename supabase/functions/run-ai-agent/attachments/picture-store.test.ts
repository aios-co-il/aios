import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { PICTURE_BYTES } from "../../_shared/image-data-url.test-fixture.ts";
import { MAX_PICTURE_BYTES, MAX_TURN_PICTURES_BYTES } from "./contract.ts";
import { COMMAND_CENTER_FILES_BUCKET } from "../../_shared/agent-channel/attachment-bucket.ts";
import {
  commandCenterPictureStore,
  loadTurnPictures,
  type PictureStore,
} from "./picture-store.ts";
import type { TurnPictures } from "./turn-pictures.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const wanted = { wanted: true, userId: USER };

/** A turn that accepted these stored files. */
function turnOf(...files: Array<string>): TurnPictures {
  return {
    pictures: files.map((file) => ({ name: file, path: `${USER}/${file}` })),
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

/** The inline addresses of the pictures that were read. */
function dataUrlsOf(turn: TurnPictures): Array<string | undefined> {
  return turn.pictures.map(({ dataUrl }) => dataUrl);
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
    assertEquals(
      dataUrlsOf(turn)[0]?.startsWith("data:image/png;base64,"),
      true,
    );
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

    assertEquals(
      dataUrlsOf(turn)[0]?.startsWith("data:image/jpeg;base64,"),
      true,
    );
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
      assertEquals(turn.pictures, []);
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
      assertEquals(typeof dataUrlsOf(turn)[0], "string");
    },
  );

  await t.step("a size that is not a number is refused unread", async () => {
    const { store, downloaded } = storeOf({});
    store.sizeOf = () => Promise.resolve(Number.NaN);

    const turn = await loadTurnPictures(store, turnOf("a.png"), wanted);

    assertEquals(turn.refused, [{ name: "a.png", refusal: "too_large" }]);
    assertEquals(downloaded, []);
  });

  await t.step(
    "pictures past the message's total weight are refused before download",
    async () => {
      const half = Math.floor(MAX_TURN_PICTURES_BYTES / 2);
      const { store, downloaded } = storeOf({
        [`${USER}/a.png`]: pngOf(half),
        [`${USER}/b.png`]: pngOf(half),
        [`${USER}/c.png`]: pngOf(half),
        [`${USER}/d.png`]: pngOf(10),
      });

      const turn = await loadTurnPictures(
        store,
        turnOf("a.png", "b.png", "c.png", "d.png"),
        wanted,
      );

      assertEquals(
        turn.pictures.map(({ name }) => name),
        ["a.png", "b.png"],
      );
      assertEquals(turn.refused, [
        { name: "c.png", refusal: "too_heavy" },
        { name: "d.png", refusal: "too_heavy" },
      ]);
      assertEquals(downloaded, [`${USER}/a.png`, `${USER}/b.png`]);
    },
  );

  await t.step("a swapped file cannot pass the total weight", async () => {
    const store: PictureStore = {
      sizeOf: () => Promise.resolve(10),
      bytesOf: () => Promise.resolve(pngOf(MAX_PICTURE_BYTES)),
    };

    const turn = await loadTurnPictures(
      store,
      turnOf("a.png", "b.png"),
      wanted,
    );

    assertEquals(turn.pictures.length, 1);
    assertEquals(turn.refused, [{ name: "b.png", refusal: "too_heavy" }]);
  });

  await t.step("one picture is held in memory at a time", async () => {
    let reading = 0;
    let most = 0;
    const store: PictureStore = {
      sizeOf: () => Promise.resolve(10),
      async bytesOf() {
        most = Math.max(most, ++reading);
        await Promise.resolve();
        reading--;
        return PICTURE_BYTES.png;
      },
    };

    await loadTurnPictures(store, turnOf("a.png", "b.png", "c.png"), wanted);

    assertEquals(most, 1);
  });

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

Deno.test("commandCenterPictureStore", async (t) => {
  /** Storage holding one file, answering a folder listing as the hosted one does. */
  function storageOf(file: { name: string; size: number }) {
    const asked: Array<string> = [];
    const storage = {
      from(bucket: string) {
        asked.push(bucket);
        return {
          list: (folder: string) =>
            Promise.resolve({
              data:
                folder === USER
                  ? [{ name: file.name, metadata: { size: file.size } }]
                  : [],
              error: null,
            }),
        };
      },
    };

    return { storage, asked };
  }

  await t.step("measures a file from its folder listing", async () => {
    const { storage, asked } = storageOf({ name: "a.png", size: 1234 });
    const store = commandCenterPictureStore({ storage });

    assertEquals(await store.sizeOf(`${USER}/a.png`), 1234);
    assertEquals(asked, [COMMAND_CENTER_FILES_BUCKET]);
  });

  await t.step(
    "a file the listing does not hold cannot be measured",
    async () => {
      const { storage } = storageOf({ name: "a.png", size: 1234 });
      const store = commandCenterPictureStore({ storage });

      await assertRejects(() => store.sizeOf(`${USER}/gone.png`));
    },
  );
});
