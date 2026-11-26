import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  isJpeg,
  PICTURE_MAX_BYTES,
  readPictureBytes,
} from "./read-picture-bytes.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** A body that never ends by itself, in chunks of `chunkBytes`; counts what was read from it. */
function endlessBody(chunkBytes: number) {
  const state = { sentBytes: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.sentBytes += chunkBytes;
      controller.enqueue(new Uint8Array(chunkBytes));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { state, body };
}

Deno.test("only bytes that start as a JPEG are a picture", () => {
  assertStrictEquals(isJpeg(JPEG), true);
  assertStrictEquals(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assertStrictEquals(isJpeg(new Uint8Array()), false);
});

Deno.test("a body within Recall's limit is read whole", async () => {
  const largest = new Uint8Array(PICTURE_MAX_BYTES);
  largest.set(JPEG);

  const bytes = await readPictureBytes(new Response(largest));

  assertEquals(bytes.length, PICTURE_MAX_BYTES);
  assertEquals(bytes.slice(0, JPEG.length), JPEG);
});

Deno.test(
  "a body declared larger than the limit is refused unread",
  async () => {
    const { state, body } = endlessBody(1024);
    const res = new Response(body, {
      headers: { "content-length": String(PICTURE_MAX_BYTES + 1) },
    });

    await assertRejects(
      () => readPictureBytes(res),
      Error,
      `too large for Recall (${PICTURE_MAX_BYTES + 1} bytes declared)`,
    );
    assertStrictEquals(state.cancelled, true);
    assertEquals(state.sentBytes <= 2 * 1024, true);
  },
);

Deno.test("a body that passes the limit is cancelled, not held", async () => {
  const chunkBytes = 64 * 1024;
  const { state, body } = endlessBody(chunkBytes);

  await assertRejects(
    () => readPictureBytes(new Response(body)),
    Error,
    `too large for Recall (over ${PICTURE_MAX_BYTES} bytes)`,
  );
  assertStrictEquals(state.cancelled, true);
  assertEquals(state.sentBytes <= PICTURE_MAX_BYTES + 3 * chunkBytes, true);
});
