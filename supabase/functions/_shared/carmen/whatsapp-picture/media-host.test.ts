import { assertEquals } from "jsr:@std/assert@1";
import { type PictureLine, pictureUrlProblem } from "./media-host.ts";

const GREEN: PictureLine = { provider: "green_api", instanceId: "7103123456" };
const MANUS: PictureLine = { provider: "manus_wa" };
const META: PictureLine = { provider: "meta_whatsapp" };

Deno.test("pictureUrlProblem: each provider's own media host", async (t) => {
  await t.step("Green API: its media storage, under this instance's id", () => {
    for (const url of [
      "https://sw-media-out.storage.yandexcloud.net/7103123456/c1aa.jpg",
      "https://do-media-7103.fra1.digitaloceanspaces.com/7103123456/c1aa.jpg",
      "https://7103.media.greenapi.com/waInstance7103123456/c1aa.jpg",
    ]) {
      assertEquals(pictureUrlProblem(url, GREEN), null, url);
    }
  });

  await t.step(
    "Green API: another instance's file or host is another line",
    () => {
      for (const url of [
        "https://sw-media-out.storage.yandexcloud.net/1101999999/c1aa.jpg",
        "https://sw-media-out.storage.yandexcloud.net/c1aa.jpg",
        "https://do-media-1101.fra1.digitaloceanspaces.com/7103123456/c1aa.jpg",
        "https://1101.media.greenapi.com/waInstance7103123456/c1aa.jpg",
      ]) {
        assertEquals(pictureUrlProblem(url, GREEN), "other_line", url);
      }
    },
  );

  await t.step("Manus: the gateway only", () => {
    assertEquals(
      pictureUrlProblem(
        "https://whatsappgw-pzpyrrww.manus.space/api/v1/media/abc",
        MANUS,
      ),
      null,
    );
  });

  await t.step("Meta: the Graph API and Meta's media host only", () => {
    assertEquals(
      pictureUrlProblem("https://graph.facebook.com/v25.0/123", META),
      null,
    );
    assertEquals(
      pictureUrlProblem(
        "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
        META,
      ),
      null,
    );
  });

  await t.step(
    "never mixes providers: one line's host is not another's",
    () => {
      assertEquals(
        pictureUrlProblem(
          "https://whatsappgw-pzpyrrww.manus.space/7103123456/a.jpg",
          GREEN,
        ),
        "host_not_allowed",
      );
      assertEquals(
        pictureUrlProblem(
          "https://7103.media.greenapi.com/waInstance7103123456/a.jpg",
          MANUS,
        ),
        "host_not_allowed",
      );
      assertEquals(
        pictureUrlProblem("https://whatsappgw-pzpyrrww.manus.space/a", META),
        "host_not_allowed",
      );
    },
  );
});

Deno.test("pictureUrlProblem: refused addresses", async (t) => {
  await t.step("anything but https on the default port", () => {
    for (const url of [
      "http://whatsappgw-pzpyrrww.manus.space/a",
      "https://whatsappgw-pzpyrrww.manus.space:8443/a",
      "file:///etc/passwd",
    ]) {
      assertEquals(pictureUrlProblem(url, MANUS), "not_https", url);
    }
    assertEquals(pictureUrlProblem("not a url", MANUS), "not_a_url");
  });

  await t.step("credentials in the address", () => {
    assertEquals(
      pictureUrlProblem("https://u:p@whatsappgw-pzpyrrww.manus.space/a", MANUS),
      "has_credentials",
    );
  });

  await t.step("private and internal hosts", () => {
    for (const url of [
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/a",
      "https://localhost/a",
      "https://[::1]/a",
      "https://db.internal/a",
    ]) {
      assertEquals(pictureUrlProblem(url, MANUS), "private_host", url);
    }
  });

  await t.step("look-alike hosts", () => {
    for (const url of [
      "https://whatsappgw-pzpyrrww.manus.space.evil.example/a",
      "https://evil-whatsappgw-pzpyrrww.manus.space/a",
      "https://lookaside.fbsbx.com.evil.example/a",
    ]) {
      const line = url.includes("fbsbx") ? META : MANUS;
      assertEquals(pictureUrlProblem(url, line), "host_not_allowed", url);
    }
  });
});
