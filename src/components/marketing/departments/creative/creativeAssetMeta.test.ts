import { describe, expect, it } from "vitest";
import type { CreativeVariation } from "./types";
import { serializeCreativeAssetMeta } from "./creativeAssetMeta";

describe("creative metadata transport parity", () => {
  it("keeps the exact seven fields and nested opaque metadata", () => {
    const active = variation();
    active.comments.push(
      Object.assign(
        { id: "comment", text: "Text", createdAt: "now" },
        { worker_note: { keep: true } },
      ),
    );
    expect(JSON.stringify(serializeCreativeAssetMeta(active))).toBe(
      originalMetadataJson(active),
    );
    expect(serializeCreativeAssetMeta(active)).toEqual({
      source: "manual_edit",
      skin_slug: "social_media",
      variation_id: "variation",
      variation_name: "Name",
      comments: [
        {
          id: "comment",
          text: "Text",
          createdAt: "now",
          worker_note: { keep: true },
        },
      ],
      layers: [],
      format: "1:1",
    });
  });

  it("does not introduce schema defaults for missing runtime fields", () => {
    const active = variation();
    for (const field of ["name", "layers", "comments", "format"])
      Reflect.deleteProperty(active, field);
    expect(JSON.stringify(serializeCreativeAssetMeta(active))).toBe(
      originalMetadataJson(active),
    );
    expect(serializeCreativeAssetMeta(active)).toEqual({
      source: "manual_edit",
      skin_slug: "social_media",
      variation_id: "variation",
    });
  });

  it("keeps transport conversion of nonfinite values instead of newly rejecting them", () => {
    const active = variation();
    active.layers.push({
      id: "layer",
      type: "text",
      x: NaN,
      y: Infinity,
      width: 1,
      height: 1,
    });
    expect(JSON.stringify(serializeCreativeAssetMeta(active))).toBe(
      originalMetadataJson(active),
    );
    expect(serializeCreativeAssetMeta(active)).toMatchObject({
      layers: [{ x: null, y: null }],
    });
  });

  it("keeps the existing serialization failure for cyclic opaque metadata", () => {
    const active = variation();
    const metadata: { self?: unknown } = {};
    metadata.self = metadata;
    active.comments.push(
      Object.assign(
        { id: "comment", text: "Text", createdAt: "now" },
        { metadata },
      ),
    );
    expect(() => originalMetadataJson(active)).toThrow(TypeError);
    expect(() => serializeCreativeAssetMeta(active)).toThrow(TypeError);
  });
});

/** The original insert projection, serialized by Supabase's JSON transport. */
function originalMetadataJson(active: CreativeVariation) {
  return JSON.stringify({
    source: "manual_edit",
    skin_slug: "social_media",
    variation_id: active.id,
    variation_name: active.name,
    comments: active.comments,
    layers: active.layers,
    format: active.format,
  });
}

/** A complete editor variation without invoking a schema or applying defaults. */
function variation(): CreativeVariation {
  return {
    id: "variation",
    imageUrl: "image",
    name: "Name",
    layers: [],
    comments: [],
    format: "1:1",
    createdAt: "now",
  };
}
