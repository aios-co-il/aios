import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { keepsDesign, redrawnClipIds } from "./keep-design.ts";

/** A Supabase stand-in whose asset read answers `answer`. */
const assets = (answer: {
  data: unknown;
  error: { message: string } | null;
}) => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve(answer),
  };
  return { from: () => builder };
};

describe("keepsDesign", () => {
  it("follows the call, then what the film chose before", () => {
    assertStrictEquals(keepsDesign({ keep_design: true }, {}), true);
    assertStrictEquals(
      keepsDesign({ keep_design: false }, { keep_design: true }),
      false,
    );
    assertStrictEquals(keepsDesign({}, { keep_design: true }), true);
    assertStrictEquals(keepsDesign({}, {}), false);
  });
});

describe("redrawnClipIds", () => {
  it("keeps only the clips a video model made from a picture", async () => {
    const ids = await redrawnClipIds(
      assets({
        data: [
          {
            id: "drawn",
            meta: { provider: "openrouter", source_still_asset_id: "a" },
          },
          {
            id: "preview",
            meta: { provider: "mock", source_still_asset_id: "a" },
          },
          { id: "uploaded", meta: { path: "u.mp4" } },
          { id: "bare", meta: null },
        ],
        error: null,
      }),
      "tenant-1",
      "item-1",
      ["drawn", "preview", "uploaded", "bare"],
    );
    assertEquals([...ids], ["drawn"]);
  });

  it("fails loudly when the clips cannot be read", async () => {
    await assertRejects(
      () =>
        redrawnClipIds(
          assets({ data: null, error: { message: "denied" } }),
          "tenant-1",
          "item-1",
          ["c-1"],
        ),
      Error,
      "denied",
    );
  });
});
