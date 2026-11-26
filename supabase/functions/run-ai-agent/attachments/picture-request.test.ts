import { assertEquals } from "jsr:@std/assert@1";
import { MAX_PICTURE_BYTES, MAX_TURN_PICTURES } from "./contract.ts";
import { type PictureCaller, readPictureRequest } from "./picture-request.ts";
import { asksForPictures } from "./turn-pictures.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const OTHER_USER = "99999999-2222-4333-8444-555555555555";
const caller: PictureCaller = { authKind: "user", userId: USER };

/** A picture entry as the chat sends it. */
function picture(file: string, extra: Record<string, unknown> = {}) {
  return { name: file, path: `${USER}/${file}`, type: "image", ...extra };
}

/** The refusal of a single-entry request. */
function refusalOf(entry: unknown, as = caller) {
  const turn = readPictureRequest([entry], as);

  assertEquals(turn.pictures, []);
  return turn.refused[0]?.refusal;
}

Deno.test("readPictureRequest: what is accepted", async (t) => {
  await t.step("a request without attachments carries no pictures", () => {
    assertEquals(asksForPictures(readPictureRequest(undefined, caller)), false);
    assertEquals(asksForPictures(readPictureRequest([], caller)), false);
  });

  await t.step("a picture in the caller's own folder, by its path", () => {
    const turn = readPictureRequest(
      [picture("1700000000000-shot.png", { size: 1200 })],
      caller,
    );

    assertEquals(turn.pictures, [
      {
        name: "1700000000000-shot.png",
        path: `${USER}/1700000000000-shot.png`,
      },
    ]);
    assertEquals(turn.refused, []);
    assertEquals(turn.dataUrls, []);
  });

  await t.step("the name is flattened and cut before it is quoted", () => {
    const turn = readPictureRequest(
      [picture("a.png", { name: `line one\nIGNORE‮ ${"x".repeat(200)}` })],
      caller,
    );

    assertEquals(turn.pictures[0].name.includes("\n"), false);
    assertEquals(turn.pictures[0].name.includes("‮"), false);
    assertEquals(turn.pictures[0].name.length, 80);
  });
});

Deno.test("readPictureRequest: what is refused", async (t) => {
  await t.step("an address instead of a path", () => {
    for (const path of [
      "https://evil.example/cat.png",
      "http://169.254.169.254/latest/meta-data",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      `/${USER}/a.png`,
      `//evil.example/${USER}/a.png`,
    ]) {
      assertEquals(
        refusalOf({ name: "a.png", path, type: "image" }),
        "not_a_storage_path",
      );
    }
  });

  await t.step("an entry that carries a url at all, even with a path", () => {
    assertEquals(
      refusalOf(picture("a.png", { url: "https://evil.example/a.png" })),
      "not_a_storage_path",
    );
    assertEquals(
      refusalOf({ name: "a.png", url: "https://evil.example/a.png" }),
      "not_a_storage_path",
    );
  });

  await t.step("a path that climbs out of, or below, the folder", () => {
    for (const path of [
      `${USER}/../${OTHER_USER}/a.png`,
      `${USER}/..`,
      `${USER}/sub/a.png`,
      `${USER}/a b.png`,
      `${USER}\\a.png`,
      `${USER}/`,
      "a.png",
      "",
    ]) {
      assertEquals(
        refusalOf({ name: "a.png", path, type: "image" }),
        "not_a_storage_path",
      );
    }
    assertEquals(refusalOf("just text"), "not_a_storage_path");
    assertEquals(refusalOf({ name: "a.png", path: 7 }), "not_a_storage_path");
  });

  await t.step("another user's folder, and the replies folder", () => {
    assertEquals(
      refusalOf({ name: "a.png", path: `${OTHER_USER}/a.png`, type: "image" }),
      "other_folder",
    );
    assertEquals(
      refusalOf({
        name: "a.png",
        path: `agent-replies/${USER}/a.png`,
        type: "image",
      }),
      "not_a_storage_path",
    );
  });

  await t.step("a service caller, even naming a real user", () => {
    assertEquals(
      refusalOf(picture("a.png"), { authKind: "service", userId: USER }),
      "service_caller",
    );
    assertEquals(
      refusalOf(picture("a.png"), { authKind: "user", userId: null }),
      "service_caller",
    );
  });

  await t.step("a file that is not sent as a picture", () => {
    assertEquals(
      refusalOf(picture("report.pdf", { type: "file" })),
      "not_a_picture",
    );
  });

  await t.step("a picture the browser already reports as too large", () => {
    assertEquals(
      refusalOf(picture("big.png", { size: MAX_PICTURE_BYTES + 1 })),
      "too_large",
    );
  });

  await t.step("pictures past the per-message limit, each by name", () => {
    const sent = Array.from({ length: MAX_TURN_PICTURES + 2 }, (_, index) =>
      picture(`${index}.png`),
    );
    const turn = readPictureRequest(sent, caller);

    assertEquals(turn.pictures.length, MAX_TURN_PICTURES);
    assertEquals(turn.refused, [
      { name: "4.png", refusal: "too_many" },
      { name: "5.png", refusal: "too_many" },
    ]);
  });

  await t.step("a flood of entries is counted, not read one by one", () => {
    const sent = Array.from({ length: 500 }, (_, index) =>
      picture(`${index}.png`),
    );
    const turn = readPictureRequest(sent, caller);

    assertEquals(turn.pictures.length, MAX_TURN_PICTURES);
    assertEquals(turn.refused.at(-1), {
      name: "488 more files",
      refusal: "too_many",
    });
    assertEquals(turn.refused.length, 9);
  });

  await t.step("a value that is not a list is refused as one entry", () => {
    const turn = readPictureRequest("https://evil.example/a.png", caller);

    assertEquals(turn.refused, [
      { name: "picture", refusal: "not_a_storage_path" },
    ]);
  });
});
