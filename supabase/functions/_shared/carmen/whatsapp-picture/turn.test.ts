import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { PictureFetchResult } from "./fetch.ts";
import {
  type InboundPicture,
  type PictureBucket,
  type PictureForTurn,
  withInboundPicture,
} from "./turn.ts";

const TENANT = "aaaaaaaa-2222-4333-8444-555555555555";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** A bucket that records what is uploaded and removed. */
function fakeBucket(options: { uploadFails?: boolean } = {}) {
  const uploaded: Array<{ path: string; mime: string }> = [];
  const removed: Array<string> = [];
  const bucket: PictureBucket = {
    upload(path, _bytes, mime) {
      if (options.uploadFails) {
        return Promise.reject(new Error("storage down"));
      }
      uploaded.push({ path, mime });
      return Promise.resolve();
    },
    remove(path) {
      removed.push(path);
      return Promise.resolve();
    },
  };
  return { bucket, uploaded, removed };
}

/** A picture whose read answers `result`, counting reads. */
function pictureReading(result: PictureFetchResult) {
  const counter = { reads: 0 };
  const picture: InboundPicture = {
    read: () => {
      counter.reads++;
      return Promise.resolve(result);
    },
  };
  return { picture, counter };
}

Deno.test("withInboundPicture: the turn gets the picture", async (t) => {
  await t.step(
    "stored in the turn's org folder, passed as an attachment, removed after",
    async () => {
      const { bucket, uploaded, removed } = fakeBucket();
      const { picture } = pictureReading({
        ok: true,
        bytes: JPEG,
        mime: "image/jpeg",
      });
      let seen: PictureForTurn | null = null;

      await withInboundPicture(bucket, TENANT, picture, (forTurn) => {
        seen = forTurn;
        assertEquals(removed, []);
        return Promise.resolve("reply");
      });

      assertEquals(uploaded.length, 1);
      assert(
        new RegExp(`^whatsapp-inbound/${TENANT}/[0-9a-f-]{36}\\.jpg$`).test(
          uploaded[0].path,
        ),
        uploaded[0].path,
      );
      assertEquals(uploaded[0].mime, "image/jpeg");
      assertEquals(seen, {
        attachments: [
          { type: "image", name: "WhatsApp picture", path: uploaded[0].path },
        ],
        note: "",
      });
      assertEquals(removed, [uploaded[0].path]);
    },
  );

  await t.step("removed even when the turn fails", async () => {
    const { bucket, uploaded, removed } = fakeBucket();
    const { picture } = pictureReading({
      ok: true,
      bytes: JPEG,
      mime: "image/jpeg",
    });

    await assertRejects(() =>
      withInboundPicture(bucket, TENANT, picture, () =>
        Promise.reject(new Error("brain down")),
      ),
    );

    assertEquals(removed, [uploaded[0].path]);
  });

  await t.step(
    "a message without a picture stores and reads nothing",
    async () => {
      const { bucket, uploaded } = fakeBucket();

      const forTurn = await withInboundPicture(bucket, TENANT, null, (p) =>
        Promise.resolve(p),
      );

      assertEquals(forTurn, { attachments: [], note: "" });
      assertEquals(uploaded, []);
    },
  );
});

Deno.test("withInboundPicture: a picture that is not read", async (t) => {
  await t.step(
    "the turn still runs, with a note telling Carmen to say so",
    async () => {
      const { bucket, uploaded } = fakeBucket();
      const { picture } = pictureReading({ ok: false, refusal: "too_large" });

      const forTurn = await withInboundPicture(bucket, TENANT, picture, (p) =>
        Promise.resolve(p),
      );

      assertEquals(forTurn.attachments, []);
      assert(forTurn.note.includes("it is too large"));
      assert(forTurn.note.includes("never guess what it shows"));
      assertEquals(uploaded, []);
    },
  );

  await t.step("a failed upload sends no path", async () => {
    const { bucket, removed } = fakeBucket({ uploadFails: true });
    const { picture } = pictureReading({
      ok: true,
      bytes: JPEG,
      mime: "image/jpeg",
    });

    const forTurn = await withInboundPicture(bucket, TENANT, picture, (p) =>
      Promise.resolve(p),
    );

    assertEquals(forTurn.attachments, []);
    assert(forTurn.note.includes("could not be saved"));
    assertEquals(removed, []);
  });

  await t.step(
    "a read that throws is a failed download, not a failed turn",
    async () => {
      const { bucket } = fakeBucket();
      const picture: InboundPicture = {
        read: () => Promise.reject(new Error("boom")),
      };

      const forTurn = await withInboundPicture(bucket, TENANT, picture, (p) =>
        Promise.resolve(p),
      );

      assert(forTurn.note.includes("could not be downloaded"));
    },
  );
});
