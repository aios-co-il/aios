import { assertEquals } from "jsr:@std/assert@1";
import { PICTURE_BYTES } from "../../_shared/image-data-url.test-fixture.ts";
import { MAX_TURN_PICTURES_BYTES } from "./contract.ts";
import { loadTurnPictures, type PictureStore } from "./picture-store.ts";

const USER = "11111111-2222-4333-8444-555555555555";

Deno.test("loadTurnPictures with a picture already read", async (t) => {
  await t.step(
    "keeps it unread, and counts its bytes towards the weight",
    async () => {
      const downloaded: Array<string> = [];
      const store: PictureStore = {
        sizeOf: () => Promise.resolve(PICTURE_BYTES.png.length),
        bytesOf: (path) => {
          downloaded.push(path);
          return Promise.resolve(PICTURE_BYTES.png);
        },
      };
      // A screenshot read before its file was deleted, nearly the whole message's weight.
      const heavy = `data:image/png;base64,${"A".repeat(
        Math.ceil((MAX_TURN_PICTURES_BYTES * 4) / 3) - 4,
      )}`;

      const turn = await loadTurnPictures(
        store,
        {
          pictures: [
            { name: "tab", path: `${USER}/gone.jpg`, dataUrl: heavy },
            { name: "b.png", path: `${USER}/b.png` },
          ],
          refused: [],
        },
        { wanted: true, userId: USER },
      );

      assertEquals(downloaded, []);
      assertEquals(
        turn.pictures.map(({ dataUrl }) => dataUrl),
        [heavy],
      );
      assertEquals(turn.refused, [{ name: "b.png", refusal: "too_heavy" }]);
    },
  );
});
