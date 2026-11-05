import { describe, expect, expectTypeOf, it } from "vitest";
import { creativeVariation, storyboardFrame } from "./creativeAssetPayload";
import type {
  CreativeLayer,
  CreativeVariation,
  StoryboardFrame,
} from "./types";

type HasIndex<Value> = string extends keyof Value ? true : false;

describe("creative asset contracts", () => {
  it("exposes named fields without arbitrary JSON keys", () => {
    expectTypeOf<HasIndex<CreativeLayer>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndex<CreativeVariation>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndex<StoryboardFrame>>().toEqualTypeOf<false>();
  });

  it("supports legacy variation defaults and retains nested metadata", () => {
    const parsed = creativeVariation.parse({
      id: "variation",
      imageUrl: "https://example.test/ad.png",
      provider: "worker-a",
      layers: [
        {
          id: "layer",
          type: "image",
          x: 1,
          y: 2,
          width: 40,
          height: 50,
          provider_asset: "asset-a",
        },
      ],
    });
    expect(parsed).toMatchObject({
      name: "גרסה",
      format: "1:1",
      comments: [],
      provider: "worker-a",
      layers: [{ provider_asset: "asset-a" }],
    });
  });

  it("rejects malformed nested fields instead of claiming complete models", () => {
    expect(() =>
      creativeVariation.parse({
        id: "variation",
        imageUrl: "image",
        layers: [
          { id: "layer", type: "image", x: 1, y: 2, width: "40", height: 50 },
        ],
      }),
    ).toThrow();
    expect(() => storyboardFrame.parse({ id: "scene", order: 1 })).toThrow();
  });

  it("validates every stored image-cost field", () => {
    expect(() =>
      creativeVariation.parse({
        id: "v",
        imageUrl: "image",
        generationCost: {
          model: "gpt-image-1",
          quality: "high",
          size: "1024x1024",
          totalTokens: 1,
          costUsd: 0.1,
        },
      }),
    ).toThrow();
  });
});
