import { assertEquals } from "jsr:@std/assert@1";
import type { Fetcher } from "../_shared/carmen/whatsapp-picture/fetch.ts";
import { manusPicture } from "./inbound-picture.ts";

const MEDIA = "https://whatsappgw-pzpyrrww.manus.space/api/v1/media/abc";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

/** A fetch that serves the PNG at every address and records each call. */
function recordingFetch() {
  const calls: Array<{ url: string; headers: unknown }> = [];
  /** Serves the PNG and records the address and headers. */
  function fetcher(url: string, init: RequestInit): Promise<Response> {
    calls.push({ url, headers: init.headers });
    return Promise.resolve(new Response(PNG));
  }
  return { fetcher: fetcher satisfies Fetcher, calls };
}

Deno.test("manusPicture: a Manus picture message", async (t) => {
  await t.step(
    "an imageMessage is read from the gateway with the line's own key",
    async () => {
      const { fetcher, calls } = recordingFetch();
      const picture = manusPicture(
        { hasMedia: true },
        { imageMessage: { url: MEDIA, mimetype: "image/png" } },
        "line-key",
        fetcher,
      );

      assertEquals(await picture?.read(), {
        ok: true,
        bytes: PNG,
        mime: "image/png",
      });
      assertEquals(calls, [
        { url: MEDIA, headers: { "X-Api-Key": "line-key" } },
      ]);
    },
  );

  await t.step(
    "a flat payload with an image type or MIME is a picture too",
    async () => {
      for (const payload of [
        { hasMedia: true, type: "image", mediaUrl: MEDIA },
        { hasMedia: true, mimeType: "image/jpeg", media: { url: MEDIA } },
        {
          hasMedia: true,
          media: { mimetype: "image/webp", downloadUrl: MEDIA },
        },
      ]) {
        const { fetcher, calls } = recordingFetch();

        assertEquals(
          (await manusPicture(payload, {}, "k", fetcher)?.read())?.ok,
          true,
        );
        assertEquals(calls[0].url, MEDIA);
      }
    },
  );

  await t.step(
    "an address off the gateway is refused, and the key never leaves",
    async () => {
      const { fetcher, calls } = recordingFetch();
      // As the webhook's unified payload carries it: any field may hold the address.
      const payload: Record<string, unknown> = {
        hasMedia: true,
        type: "image",
        url: "https://evil.example/a.png",
      };
      const picture = manusPicture(payload, {}, "line-key", fetcher);

      assertEquals(await picture?.read(), {
        ok: false,
        refusal: "host_not_allowed",
      });
      assertEquals(calls, []);
    },
  );

  await t.step("voice notes, documents and text carry no picture", () => {
    assertEquals(
      manusPicture(
        { hasMedia: true, type: "ptt", mimeType: "audio/ogg" },
        {},
        "k",
      ),
      null,
    );
    assertEquals(
      manusPicture({ hasMedia: true, mimeType: "application/pdf" }, {}, "k"),
      null,
    );
    assertEquals(
      manusPicture({ hasMedia: false, type: "image" }, {}, "k"),
      null,
    );
  });

  await t.step(
    "a picture without an address is one that was not read",
    async () => {
      const picture = manusPicture({ hasMedia: true, type: "image" }, {}, "k");

      assertEquals(await picture?.read(), {
        ok: false,
        refusal: "download_failed",
      });
    },
  );
});
