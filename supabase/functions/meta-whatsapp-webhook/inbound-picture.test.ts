import { assertEquals } from "jsr:@std/assert@1";
import type { Fetcher } from "../_shared/carmen/whatsapp-picture/fetch.ts";
import { MAX_PICTURE_BYTES } from "../run-ai-agent/attachments/contract.ts";
import { metaPicture } from "./inbound-picture.ts";

const MEDIA_URL =
  "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1";
const INFO_URL = "https://graph.facebook.com/v25.0/1234567890";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 7]);

/** A fetch that answers the Graph API's media object and the file, recording each call. */
function graphFetch(info: Record<string, unknown>) {
  const calls: Array<{ url: string; headers: unknown }> = [];
  /** Answers the Graph API with `info` and any other address with the JPEG. */
  function fetcher(url: string, init: RequestInit): Promise<Response> {
    calls.push({ url, headers: init.headers });
    if (url.startsWith("https://graph.facebook.com/")) {
      return Promise.resolve(Response.json(info));
    }
    return Promise.resolve(new Response(JPEG));
  }
  return { fetcher: fetcher satisfies Fetcher, calls };
}

const line = { token: () => Promise.resolve("line-token") };

Deno.test("metaPicture: a Cloud API image message", async (t) => {
  await t.step(
    "the media id is resolved, then read, both with the number's own token",
    async () => {
      const { fetcher, calls } = graphFetch({ url: MEDIA_URL, file_size: 5 });
      const picture = metaPicture(
        { type: "image", image: { id: "1234567890", caption: "מה זה?" } },
        line,
        fetcher,
      );

      assertEquals(await picture?.read(), {
        ok: true,
        bytes: JPEG,
        mime: "image/jpeg",
      });
      assertEquals(calls, [
        { url: INFO_URL, headers: { Authorization: "Bearer line-token" } },
        { url: MEDIA_URL, headers: { Authorization: "Bearer line-token" } },
      ]);
    },
  );

  await t.step(
    "a file address off Meta's media host is refused, and gets no token",
    async () => {
      const { fetcher, calls } = graphFetch({
        url: "https://evil.example/a.jpg",
      });
      const picture = metaPicture(
        { type: "image", image: { id: "1234567890" } },
        line,
        fetcher,
      );

      assertEquals(await picture?.read(), {
        ok: false,
        refusal: "host_not_allowed",
      });
      assertEquals(
        calls.map(({ url }) => url),
        [INFO_URL],
      );
    },
  );

  await t.step("a declared size over the cap is never downloaded", async () => {
    const { fetcher, calls } = graphFetch({
      url: MEDIA_URL,
      file_size: MAX_PICTURE_BYTES + 1,
    });
    const picture = metaPicture(
      { type: "image", image: { id: "1234567890" } },
      line,
      fetcher,
    );

    assertEquals(await picture?.read(), { ok: false, refusal: "too_large" });
    assertEquals(calls.length, 1);
  });

  await t.step(
    "a media id that is not one, or a line without a token, reads nothing",
    async () => {
      const { fetcher, calls } = graphFetch({ url: MEDIA_URL });

      for (const id of ["../me", "123/../x", "", undefined]) {
        const picture = metaPicture(
          { type: "image", image: { id } },
          line,
          fetcher,
        );
        assertEquals(await picture?.read(), {
          ok: false,
          refusal: "download_failed",
        });
      }
      const noToken = metaPicture(
        { type: "image", image: { id: "1" } },
        { token: () => Promise.resolve(null) },
        fetcher,
      );
      assertEquals(await noToken?.read(), {
        ok: false,
        refusal: "download_failed",
      });
      assertEquals(calls, []);
    },
  );

  await t.step(
    "a stored Graph version that is not one falls back to the default",
    async () => {
      const { fetcher, calls } = graphFetch({ url: MEDIA_URL });
      const picture = metaPicture(
        { type: "image", image: { id: "1234567890" } },
        { ...line, graphVersion: "v1.0/../../me?x=" },
        fetcher,
      );

      await picture?.read();
      assertEquals(calls[0].url, INFO_URL);
    },
  );

  await t.step("other message types carry no picture", () => {
    for (const type of ["text", "audio", "video", "sticker", "document"]) {
      assertEquals(metaPicture({ type, [type]: { id: "1" } }, line), null);
    }
  });
});
