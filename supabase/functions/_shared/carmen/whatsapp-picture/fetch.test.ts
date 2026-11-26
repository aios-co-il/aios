import { assertEquals } from "jsr:@std/assert@1";
import { MAX_PICTURE_BYTES } from "../../../run-ai-agent/attachments/contract.ts";
import { type Fetcher, fetchInboundPicture } from "./fetch.ts";
import type { PictureLine } from "./media-host.ts";

const MANUS: PictureLine = { provider: "manus_wa" };
const GATEWAY = "https://whatsappgw-pzpyrrww.manus.space/media/1";
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
]);

/** A fetch that answers from a map of address → response, recording every call. */
function fakeFetch(answers: Record<string, () => Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  /** Answers `url` from the map; an unknown address is unreachable. */
  function fetcher(url: string, init: RequestInit): Promise<Response> {
    calls.push({ url, init });
    const answer = answers[url];
    return answer
      ? Promise.resolve(answer())
      : Promise.reject(new Error("unreachable"));
  }
  return { fetcher: fetcher satisfies Fetcher, calls };
}

Deno.test("fetchInboundPicture: what is downloaded", async (t) => {
  await t.step(
    "a picture from the line's host, its type read from the bytes",
    async () => {
      const { fetcher, calls } = fakeFetch({
        [GATEWAY]: () => new Response(PNG),
      });

      const result = await fetchInboundPicture(GATEWAY, MANUS, {
        headers: { "X-Api-Key": "line-key" },
        fetcher,
      });

      assertEquals(result, { ok: true, bytes: PNG, mime: "image/png" });
      assertEquals(calls[0].init.redirect, "manual");
      assertEquals(calls[0].init.headers, { "X-Api-Key": "line-key" });
    },
  );

  await t.step("a redirect to the same host is followed", async () => {
    const next = "https://whatsappgw-pzpyrrww.manus.space/media/2";
    const { fetcher } = fakeFetch({
      [GATEWAY]: () =>
        new Response(null, { status: 302, headers: { location: "/media/2" } }),
      [next]: () => new Response(PNG),
    });

    assertEquals(
      (await fetchInboundPicture(GATEWAY, MANUS, { fetcher })).ok,
      true,
    );
  });
});

Deno.test("fetchInboundPicture: what is refused", async (t) => {
  await t.step(
    "an address off the line's host is never requested",
    async () => {
      const { fetcher, calls } = fakeFetch({});

      const result = await fetchInboundPicture(
        "https://169.254.169.254/x",
        MANUS,
        { fetcher },
      );

      assertEquals(result, { ok: false, refusal: "host_not_allowed" });
      assertEquals(calls.length, 0);
    },
  );

  await t.step(
    "a redirect to another host is not followed, and gets no key",
    async () => {
      const { fetcher, calls } = fakeFetch({
        [GATEWAY]: () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.example/a" },
          }),
      });

      const result = await fetchInboundPicture(GATEWAY, MANUS, {
        headers: { "X-Api-Key": "line-key" },
        fetcher,
      });

      assertEquals(result, { ok: false, refusal: "host_not_allowed" });
      assertEquals(
        calls.map(({ url }) => url),
        [GATEWAY],
      );
    },
  );

  await t.step("a redirect loop stops", async () => {
    const { fetcher, calls } = fakeFetch({
      [GATEWAY]: () =>
        new Response(null, { status: 302, headers: { location: GATEWAY } }),
    });

    assertEquals(await fetchInboundPicture(GATEWAY, MANUS, { fetcher }), {
      ok: false,
      refusal: "download_failed",
    });
    assertEquals(calls.length, 3);
  });

  await t.step("a declared size over the cap is never downloaded", async () => {
    let pulled = false;
    // No queue: a chunk is produced only when the reader asks for one.
    const body = new ReadableStream(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(PNG);
        },
      },
      { highWaterMark: 0 },
    );
    const { fetcher } = fakeFetch({
      [GATEWAY]: () =>
        new Response(body, {
          headers: { "content-length": String(MAX_PICTURE_BYTES + 1) },
        }),
    });

    assertEquals(await fetchInboundPicture(GATEWAY, MANUS, { fetcher }), {
      ok: false,
      refusal: "too_large",
    });
    assertEquals(pulled, false);
  });

  await t.step("a body that keeps coming past the cap is cut off", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const { fetcher } = fakeFetch({ [GATEWAY]: () => new Response(endless) });

    assertEquals(await fetchInboundPicture(GATEWAY, MANUS, { fetcher }), {
      ok: false,
      refusal: "too_large",
    });
    assertEquals(sent <= MAX_PICTURE_BYTES + 2 * chunk.length, true);
  });

  await t.step(
    "bytes that are not a picture, whatever the header says",
    async () => {
      const { fetcher } = fakeFetch({
        [GATEWAY]: () =>
          new Response("<svg onload=alert(1)>", {
            headers: { "content-type": "image/png" },
          }),
      });

      assertEquals(await fetchInboundPicture(GATEWAY, MANUS, { fetcher }), {
        ok: false,
        refusal: "not_a_picture",
      });
    },
  );

  await t.step("an error answer, and a network failure", async () => {
    const failing = fakeFetch({
      [GATEWAY]: () => new Response("no", { status: 403 }),
    });
    const unreachable = fakeFetch({});

    assertEquals(
      await fetchInboundPicture(GATEWAY, MANUS, { fetcher: failing.fetcher }),
      {
        ok: false,
        refusal: "download_failed",
      },
    );
    assertEquals(
      await fetchInboundPicture(GATEWAY, MANUS, {
        fetcher: unreachable.fetcher,
      }),
      { ok: false, refusal: "download_failed" },
    );
  });
});
