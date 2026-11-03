import { describe, expect, it } from "vitest";
import { creativeVariation } from "./creativeAssetPayload";
import { serializeCreativeAssetMeta } from "./creativeAssetMeta";

describe("creative asset metadata boundary", () => {
  it("serializes the actual editor asset projection without dropping nested metadata", () => {
    const variation = creativeVariation.parse({
      id: "asset",
      imageUrl: "image",
      comments: [
        { id: "comment", text: "Text", createdAt: "now", worker_note: "Keep" },
      ],
    });
    expect(serializeCreativeAssetMeta(variation)).toMatchObject({
      source: "manual_edit",
      skin_slug: "social_media",
      variation_id: "asset",
      comments: [{ worker_note: "Keep" }],
    });
  });
});
