import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creativeVariation } from "./creativeAssetPayload";
import {
  saveCreativeVariation,
  serializeCreativeAssetMeta,
} from "./creativeAssetMeta";

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: db.rpc },
}));

beforeEach(() => {
  vi.resetAllMocks();
  db.rpc.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

const request = () => ({
  itemId: "item",
  tenantId: "tenant",
  stageId: null,
  payload: {},
  active: creativeVariation.parse({ id: "asset", imageUrl: "image" }),
});

describe("creative asset persistence boundary", () => {
  it("preserves the original projection and opaque nested metadata", () => {
    const variation = creativeVariation.parse({
      id: "asset",
      imageUrl: "image",
      comments: [
        { id: "comment", text: "Text", createdAt: "now", worker_note: "Keep" },
      ],
    });
    expect(serializeCreativeAssetMeta(variation)).toEqual({
      source: "manual_edit",
      skin_slug: "social_media",
      variation_id: "asset",
      variation_name: "גרסה",
      comments: [
        { id: "comment", text: "Text", createdAt: "now", worker_note: "Keep" },
      ],
      layers: [],
      format: "1:1",
    });
  });

  it("rejects an invalid complete variation before any RPC with safe diagnostics", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = request();
    input.active.layers.push({
      id: "layer",
      type: "text",
      x: NaN,
      y: 0,
      width: 1,
      height: 1,
    });
    await expect(saveCreativeVariation(input)).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Invalid creative asset variation", {
      fields: ["layers.0.x"],
    });
  });

  it("sends both snapshots in one transaction using normalized defaults", async () => {
    const input = request();
    for (const field of ["name", "format", "layers", "comments"])
      Reflect.deleteProperty(input.active, field);
    await saveCreativeVariation({ ...input, stageId: "stage" });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("save_creative_variation", {
      p_item_id: "item",
      p_tenant_id: "tenant",
      p_stage_id: "stage",
      p_payload: {},
      p_url: "image",
      p_content: JSON.stringify({ layers: [], format: "1:1" }),
      p_meta: serializeCreativeAssetMeta(input.active),
    });
  });

  it("serializes project JSON before making any RPC", async () => {
    await saveCreativeVariation({
      ...request(),
      payload: {
        date: new Date("2026-01-01"),
        omitted: undefined,
        opaque: { keep: true },
      },
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "save_creative_variation",
      expect.objectContaining({
        p_payload: { date: "2026-01-01T00:00:00.000Z", opaque: { keep: true } },
      }),
    );
    db.rpc.mockClear();
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(
      saveCreativeVariation({ ...request(), payload: circular }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each(["database", "transport"])(
    "propagates %s failure without any compensating request",
    async (failure) => {
      const error = new Error("save failed");
      if (failure === "database") db.rpc.mockResolvedValue({ error });
      else db.rpc.mockRejectedValue(error);
      await expect(saveCreativeVariation(request())).rejects.toEqual(error);
      expect(db.rpc).toHaveBeenCalledOnce();
    },
  );

  it("keeps a committed pair intact when its response is lost", async () => {
    const committed: string[] = [];
    db.rpc.mockImplementation(async () => {
      committed.push("project", "image");
      throw new Error("response lost after commit");
    });
    await expect(saveCreativeVariation(request())).rejects.toThrow(
      "response lost after commit",
    );
    expect(committed).toEqual(["project", "image"]);
    expect(db.rpc).toHaveBeenCalledOnce();
  });

  it("omits the image snapshot when no variation is active", async () => {
    await saveCreativeVariation({ ...request(), active: undefined });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("save_creative_variation", {
      p_item_id: "item",
      p_tenant_id: "tenant",
      p_payload: {},
      p_stage_id: undefined,
    });
  });
});
