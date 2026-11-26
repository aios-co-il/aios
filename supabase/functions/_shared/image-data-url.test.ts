import { assertEquals } from "jsr:@std/assert@1";
import { imageDataUrl, sniffImageMime } from "./image-data-url.ts";
import { PICTURE_BYTES } from "./image-data-url.test-fixture.ts";

Deno.test("sniffImageMime", async (t) => {
  await t.step("reads each of the four types from its first bytes", () => {
    assertEquals(sniffImageMime(PICTURE_BYTES.jpeg), "image/jpeg");
    assertEquals(sniffImageMime(PICTURE_BYTES.png), "image/png");
    assertEquals(sniffImageMime(PICTURE_BYTES.webp), "image/webp");
    assertEquals(sniffImageMime(PICTURE_BYTES.gif), "image/gif");
  });

  await t.step("refuses anything else, whatever it is called", () => {
    assertEquals(sniffImageMime(PICTURE_BYTES.pdf), null);
    assertEquals(sniffImageMime(new TextEncoder().encode("<svg/>")), null);
    assertEquals(sniffImageMime(new Uint8Array()), null);
  });

  await t.step("a RIFF file that is not WEBP is not a picture", () => {
    const wave = PICTURE_BYTES.webp.slice();
    wave.set(new TextEncoder().encode("WAVE"), 8);

    assertEquals(sniffImageMime(wave), null);
  });
});

Deno.test("imageDataUrl", async (t) => {
  await t.step("writes the bytes as base64 under the given type", () => {
    assertEquals(
      imageDataUrl(new TextEncoder().encode("hello"), "image/png"),
      "data:image/png;base64,aGVsbG8=",
    );
  });

  await t.step("encodes a picture-sized input", () => {
    const url = imageDataUrl(new Uint8Array(300_000).fill(0xff), "image/jpeg");

    assertEquals(url.length, "data:image/jpeg;base64,".length + 400_000);
  });
});
