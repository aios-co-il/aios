import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creativeVariation } from "./creativeAssetPayload";
import {
  saveCreativeVariation,
  serializeCreativeAssetMeta,
} from "./creativeAssetMeta";

const db = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  cleanup: vi.fn(),
  projectFilters: vi.fn(),
  cleanupFilters: vi.fn(),
  itemError: null as { message: string } | null,
  assetError: null as { message: string } | null,
  cleanupError: null as { message: string } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (value: unknown) => {
        db.update(value);
        const query = {
          eq: (key: string, value: string) => {
            db.projectFilters(key, value);
            return query;
          },
          select: () => ({ single: async () => ({ error: db.itemError }) }),
        };
        return query;
      },
      insert: async (value: unknown) => {
        db.insert(value);
        return { error: db.assetError };
      },
      delete: () => {
        db.cleanup();
        const query = {
          eq: (key: string, value: string) => {
            db.cleanupFilters(key, value);
            return query;
          },
          select: () => ({ single: async () => ({ error: db.cleanupError }) }),
        };
        return query;
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  db.itemError = null;
  db.assetError = null;
  db.cleanupError = null;
});
afterEach(() => vi.restoreAllMocks());

const request = () => ({
  itemId: "item",
  tenantId: "tenant",
  stageId: null,
  payload: {},
  active: creativeVariation.parse({ id: "asset", imageUrl: "image" }),
});

describe("creative asset metadata boundary", () => {
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

  it("rejects an invalid complete variation before any write with safe field diagnostics", async () => {
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
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Invalid creative asset variation", {
      fields: ["layers.0.x"],
    });
  });

  it("uses normalized defaults for both metadata and asset content", async () => {
    const input = request();
    for (const field of ["name", "format", "layers", "comments"])
      Reflect.deleteProperty(input.active, field);
    await saveCreativeVariation(input);
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant",
        item_id: "item",
        type: "image",
        url: "image",
        content: JSON.stringify({ layers: [], format: "1:1" }),
        meta: expect.objectContaining({
          variation_name: "גרסה",
          layers: [],
          comments: [],
          format: "1:1",
        }),
      }),
    );
    expect(db.insert.mock.invocationCallOrder[0]).toBeLessThan(
      db.update.mock.invocationCallOrder[0],
    );
    expect(db.projectFilters.mock.calls).toEqual([
      ["id", "item"],
      ["tenant_id", "tenant"],
    ]);
    expect(db.cleanup).not.toHaveBeenCalled();
  });

  it("serializes project JSON inside the boundary before inserting an asset", async () => {
    await saveCreativeVariation({
      ...request(),
      payload: {
        date: new Date("2026-01-01"),
        omitted: undefined,
        opaque: { keep: true },
      },
    });
    expect(db.update).toHaveBeenCalledWith({
      payload: { date: "2026-01-01T00:00:00.000Z", opaque: { keep: true } },
    });
    db.insert.mockClear();
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(
      saveCreativeVariation({ ...request(), payload: circular }),
    ).rejects.toThrow();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not update the project when asset insertion fails", async () => {
    db.assetError = { message: "insert failed" };
    await expect(saveCreativeVariation(request())).rejects.toEqual(
      db.assetError,
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(db.cleanup).not.toHaveBeenCalled();
  });

  it("removes only this new asset when the project write fails without rewriting concurrent payloads", async () => {
    db.itemError = { message: "project failed or row missing" };
    await expect(saveCreativeVariation(request())).rejects.toEqual(
      db.itemError,
    );
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.cleanup).toHaveBeenCalledTimes(1);
    expect(db.cleanupFilters.mock.calls).toEqual([
      ["id", expect.any(String)],
      ["tenant_id", "tenant"],
      ["item_id", "item"],
    ]);
    const insertedId = db.cleanupFilters.mock.calls[0][1];
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: insertedId }),
    );
    expect(db.update.mock.invocationCallOrder[0]).toBeLessThan(
      db.cleanup.mock.invocationCallOrder[0],
    );
  });

  it("surfaces and records a failed or missing compensation row", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.itemError = { message: "project failed" };
    db.cleanupError = { message: "delete failed or row missing" };
    await expect(saveCreativeVariation(request())).rejects.toThrow(
      "שמירת הפרויקט וניקוי תמונת הנכס נכשלו",
    );
    expect(log).toHaveBeenCalledWith("Creative asset compensation failed", {
      error: db.itemError,
      cleanupError: db.cleanupError,
    });
  });

  it("saves a project without an active variation without inserting or deleting assets", async () => {
    await saveCreativeVariation({ ...request(), active: undefined });
    expect(db.update).toHaveBeenCalledWith({ payload: {} });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.cleanup).not.toHaveBeenCalled();
  });
});
