import { assertEquals } from "jsr:@std/assert@1";
import type { Fetcher } from "../_shared/carmen/whatsapp-picture/fetch.ts";
import { greenApiPicture } from "./inbound-picture.ts";

const INSTANCE = 7103123456;
const OWN_FILE =
  "https://sw-media-out.storage.yandexcloud.net/7103123456/c1aa.jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]);

/** A fetch that serves the JPEG at every address and records them. */
function recordingFetch() {
  const urls: Array<string> = [];
  /** Serves the JPEG and records the address. */
  function fetcher(url: string): Promise<Response> {
    urls.push(url);
    return Promise.resolve(new Response(JPEG));
  }
  return { fetcher: fetcher satisfies Fetcher, urls };
}

Deno.test("greenApiPicture: Green API's imageMessage", async (t) => {
  await t.step(
    "reads the picture from the instance's own media file",
    async () => {
      const { fetcher, urls } = recordingFetch();
      const picture = greenApiPicture(
        {
          typeMessage: "imageMessage",
          fileMessageData: { downloadUrl: OWN_FILE },
        },
        INSTANCE,
        fetcher,
      );

      assertEquals(await picture?.read(), {
        ok: true,
        bytes: JPEG,
        mime: "image/jpeg",
      });
      assertEquals(urls, [OWN_FILE]);
    },
  );

  await t.step("nothing is downloaded until the turn asks for it", () => {
    const { fetcher, urls } = recordingFetch();

    greenApiPicture(
      {
        typeMessage: "imageMessage",
        fileMessageData: { downloadUrl: OWN_FILE },
      },
      INSTANCE,
      fetcher,
    );

    assertEquals(urls, []);
  });

  await t.step(
    "another instance's file is refused without a request",
    async () => {
      const { fetcher, urls } = recordingFetch();
      const picture = greenApiPicture(
        {
          typeMessage: "imageMessage",
          fileMessageData: {
            downloadUrl:
              "https://sw-media-out.storage.yandexcloud.net/1101999999/x.jpg",
          },
        },
        INSTANCE,
        fetcher,
      );

      assertEquals(await picture?.read(), {
        ok: false,
        refusal: "host_not_allowed",
      });
      assertEquals(urls, []);
    },
  );

  await t.step(
    "an imageMessage without an address is a picture that was not read",
    async () => {
      const picture = greenApiPicture(
        { typeMessage: "imageMessage" },
        INSTANCE,
      );

      assertEquals(await picture?.read(), {
        ok: false,
        refusal: "download_failed",
      });
    },
  );

  await t.step("other message types carry no picture", () => {
    for (const typeMessage of [
      "textMessage",
      "videoMessage",
      "audioMessage",
      "stickerMessage",
    ]) {
      assertEquals(
        greenApiPicture(
          { typeMessage, fileMessageData: { downloadUrl: OWN_FILE } },
          INSTANCE,
        ),
        null,
      );
    }
    assertEquals(greenApiPicture(undefined, INSTANCE), null);
  });
});
