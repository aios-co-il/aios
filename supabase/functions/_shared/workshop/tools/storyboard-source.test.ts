import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { storyboardSource, withSourcePicture } from "./storyboard-source.ts";

describe("withSourcePicture", () => {
  it("draws a scene without its own picture from the source", () => {
    assertEquals(withSourcePicture({ title: "a" }, "https://x/p.png"), {
      title: "a",
      reference_url: "https://x/p.png",
    });
  });

  it("keeps a scene's own picture, and changes nothing with no source", () => {
    const own = { reference_url: "https://x/own.png" };
    assertStrictEquals(withSourcePicture(own, "https://x/p.png"), own);
    const plain = { title: "b" };
    assertStrictEquals(withSourcePicture(plain, null), plain);
  });
});

describe("storyboardSource", () => {
  it("needs no lookup when no source picture is named", async () => {
    const source = await storyboardSource(
      { supabase: null, tenantId: "tenant-1", args: {} },
      "item-1",
    );
    assertEquals(source, { url: null });
  });
});
