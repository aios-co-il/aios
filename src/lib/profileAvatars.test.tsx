import { describe, expect, it } from "vitest";
import { readSkinAvatars, validateAvatarFile } from "./profileAvatars";
import { getSessionSkin, setSessionSkin } from "./carmenSessionSkin";

describe("profileAvatars", () => {
  it("reads per-skin avatars and ignores malformed entries", () => {
    expect(
      readSkinAvatars({
        visual_identity: { skins: { seo: { avatarPath: "t/a.png" }, bad: 3 } },
      }),
    ).toEqual({ seo: { avatarPath: "t/a.png" } });
    expect(readSkinAvatars(null)).toEqual({});
  });
  it("keeps the session skin per tenant, in memory only", () => {
    setSessionSkin("t1", "copy");
    expect(getSessionSkin("t1")).toBe("copy");
    expect(getSessionSkin("t2")).toBeNull();
    setSessionSkin("t1", null);
    expect(getSessionSkin("t1")).toBeNull();
  });
  it("validates avatar files", () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    expect(validateAvatarFile(png)).toBeNull();
    expect(
      validateAvatarFile(new File(["x"], "a.gif", { type: "image/gif" })),
    ).toBeTruthy();
  });
});
