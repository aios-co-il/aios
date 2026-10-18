import { describe, expect, it } from "vitest";
import {
  readActiveSkin,
  readSkinAvatars,
  validateAvatarFile,
} from "./profileAvatars";

describe("profileAvatars", () => {
  it("reads per-skin avatars and ignores malformed entries", () => {
    expect(
      readSkinAvatars({
        visual_identity: { skins: { seo: { avatarPath: "t/a.png" }, bad: 3 } },
      }),
    ).toEqual({ seo: { avatarPath: "t/a.png" } });
    expect(readSkinAvatars(null)).toEqual({});
  });
  it("reads the active skin", () => {
    expect(readActiveSkin({ active_skin: "copy" })).toBe("copy");
    expect(readActiveSkin({ active_skin: "" })).toBeNull();
  });
  it("validates avatar files", () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    expect(validateAvatarFile(png)).toBeNull();
    expect(
      validateAvatarFile(new File(["x"], "a.gif", { type: "image/gif" })),
    ).toBeTruthy();
  });
});
