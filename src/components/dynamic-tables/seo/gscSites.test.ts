import { describe, expect, it } from "vitest";
import { toGscSites } from "./gscSites";
describe("toGscSites", () => {
  it("keeps sites with a siteUrl", () => {
    expect(
      toGscSites([
        { siteUrl: "sc-domain:a.com", permissionLevel: "siteOwner" },
        { siteUrl: "https://b.com/", permissionLevel: 3 },
        { permissionLevel: "siteOwner" },
        "x",
      ]),
    ).toEqual([
      { siteUrl: "sc-domain:a.com", permissionLevel: "siteOwner" },
      { siteUrl: "https://b.com/", permissionLevel: undefined },
    ]);
  });
});
