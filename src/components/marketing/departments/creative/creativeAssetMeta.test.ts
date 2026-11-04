import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creativeVariation } from "./creativeAssetPayload";
import {
  saveCreativeVariation,
  serializeCreativeAssetMeta,
} from "./creativeAssetMeta";

const db = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  itemError: null as { message: string } | null,
  assetError: null as { message: string } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (value: unknown) => {
        db.update(value);
        return { eq: () => ({ eq: async () => ({ error: db.itemError }) }) };
      },
      insert: async (value: unknown) => {
        db.insert(value);
        return { error: db.assetError };
      },
    }),
  },
}));
beforeEach(() => {
  db.itemError = null;
  db.assetError = null;
});
afterEach(() => vi.restoreAllMocks());

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

  it("rejects invalid variation fields before any project or asset write", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const active = creativeVariation.parse({
      id: "asset",
      imageUrl: "private",
    });
    active.layers.push({
      id: "layer",
      type: "text",
      x: NaN,
      y: 0,
      width: 1,
      height: 1,
    });
    await expect(
      saveCreativeVariation({
        itemId: "item",
        tenantId: "tenant",
        stageId: null,
        payload: {},
        active,
      }),
    ).rejects.toThrow();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Invalid creative asset variation", {
      fields: ["layers.0.x"],
    });
  });

  it("saves valid metadata after the project succeeds", async () => {
    const active = creativeVariation.parse({ id: "asset", imageUrl: "image" });
    await saveCreativeVariation({
      itemId: "item",
      tenantId: "tenant",
      stageId: null,
      payload: {},
      active,
    });
    expect(db.update).toHaveBeenCalledWith({ payload: {} });
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: "item",
        tenant_id: "tenant",
        meta: serializeCreativeAssetMeta(active),
      }),
    );
    expect(db.update.mock.invocationCallOrder[0]).toBeLessThan(
      db.insert.mock.invocationCallOrder[0],
    );
  });

  it.each(["project", "asset"])(
    "propagates a failed %s write",
    async (operation) => {
      const failure = { message: "save failed" };
      if (operation === "project") {
        db.itemError = failure;
      } else {
        db.assetError = failure;
      }
      await expect(
        saveCreativeVariation({
          itemId: "item",
          tenantId: "tenant",
          stageId: null,
          payload: {},
          active: creativeVariation.parse({ id: "asset", imageUrl: "image" }),
        }),
      ).rejects.toEqual(failure);
      if (operation === "project") {
        expect(db.insert).not.toHaveBeenCalled();
      }
    },
  );
});
