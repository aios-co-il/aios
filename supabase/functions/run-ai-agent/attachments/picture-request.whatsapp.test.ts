import { assertEquals } from "jsr:@std/assert@1";
import { COMMAND_CENTER_FILES_BUCKET } from "../../_shared/agent-channel/attachment-bucket.ts";
import {
  WHATSAPP_PICTURES_BUCKET,
  whatsappPicturePath,
} from "../../_shared/carmen/whatsapp-picture/bucket.ts";
import {
  type PictureCaller,
  pictureBucketOf,
  readPictureRequest,
} from "./picture-request.ts";

const TENANT = "aaaaaaaa-2222-4333-8444-555555555555";
const OTHER_TENANT = "bbbbbbbb-2222-4333-8444-555555555555";
const USER = "11111111-2222-4333-8444-555555555555";

/** The WhatsApp webhooks' call, as run-ai-agent resolves it (runCarmenAI in _shared/carmen.ts). */
const webhook: PictureCaller = {
  authKind: "service",
  userId: null,
  surface: "whatsapp",
  tenantId: TENANT,
};

/** A picture entry as runCarmenAI sends it. */
function picture(path: string, extra: Record<string, unknown> = {}) {
  return { name: "WhatsApp picture", path, type: "image", ...extra };
}

/** The refusal of a single-entry request. */
function refusalOf(entry: unknown, as: PictureCaller = webhook) {
  const turn = readPictureRequest([entry], as);

  assertEquals(turn.pictures, []);
  return turn.refused[0]?.refusal;
}

Deno.test(
  "readPictureRequest: the WhatsApp webhooks' service rule",
  async (t) => {
    await t.step(
      "accepts a picture stored in the turn's own org folder",
      () => {
        const path = whatsappPicturePath(TENANT, "0b8c-1.jpg");

        assertEquals(readPictureRequest([picture(path)], webhook), {
          pictures: [{ name: "WhatsApp picture", path }],
          refused: [],
        });
        assertEquals(pictureBucketOf(webhook), WHATSAPP_PICTURES_BUCKET);
      },
    );

    await t.step(
      "refuses another org's folder: the path is not trusted",
      () => {
        assertEquals(
          refusalOf(picture(whatsappPicturePath(OTHER_TENANT, "a.jpg"))),
          "other_folder",
        );
      },
    );

    await t.step(
      "refuses any other folder of the org, or a climb out of it",
      () => {
        for (const path of [
          `${TENANT}/a.jpg`,
          `${TENANT}/creatives/a.jpg`,
          `${TENANT}/whatsapp-inbound/../a.jpg`,
          `${TENANT}/whatsapp-inbound/..`,
          `${TENANT}/whatsapp-inbound/sub/a.jpg`,
          `/${TENANT}/whatsapp-inbound/a.jpg`,
          `https://evil.example/${TENANT}/whatsapp-inbound/a.jpg`,
        ]) {
          assertEquals(refusalOf(picture(path)), "not_a_storage_path", path);
        }
      },
    );

    await t.step(
      "refuses an entry that carries an address, and a non-picture",
      () => {
        const path = whatsappPicturePath(TENANT, "a.jpg");

        assertEquals(
          refusalOf(picture(path, { url: "https://evil.example/a.jpg" })),
          "not_a_storage_path",
        );
        assertEquals(
          refusalOf(picture(path, { type: "file" })),
          "not_a_picture",
        );
      },
    );

    await t.step(
      "is the service's only: a service call off WhatsApp, or without an org, sends none",
      () => {
        const path = whatsappPicturePath(TENANT, "a.jpg");

        assertEquals(
          refusalOf(picture(path), { ...webhook, surface: "internal_chat" }),
          "service_caller",
        );
        assertEquals(
          refusalOf(picture(path), { ...webhook, tenantId: null }),
          "service_caller",
        );
        assertEquals(
          pictureBucketOf({ ...webhook, surface: "task" }),
          COMMAND_CENTER_FILES_BUCKET,
        );
      },
    );
  },
);

Deno.test("readPictureRequest: the user rule is not loosened", async (t) => {
  const user: PictureCaller = {
    authKind: "user",
    userId: USER,
    // A user JWT never keeps the whatsapp surface (bindRunAgentCaller); even if it did,
    // the user rule still holds.
    surface: "whatsapp",
    tenantId: TENANT,
  };

  await t.step("a signed-in user cannot name the org's WhatsApp folder", () => {
    assertEquals(
      refusalOf(picture(whatsappPicturePath(TENANT, "a.jpg")), user),
      "not_a_storage_path",
    );
    assertEquals(pictureBucketOf(user), COMMAND_CENTER_FILES_BUCKET);
  });

  await t.step(
    "their own folder still works, read from the Command Center bucket",
    () => {
      const path = `${USER}/a.png`;

      assertEquals(readPictureRequest([picture(path)], user).pictures, [
        { name: "WhatsApp picture", path },
      ]);
    },
  );
});
