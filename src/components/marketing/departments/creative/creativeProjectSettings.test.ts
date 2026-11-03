import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  deriveBrandBook,
  getBrandKit,
  type BrandBook,
  type StyleReference,
} from "./brandKit";
import {
  readCreativeVideoSettings,
  type CreativeVideoSettings,
} from "./creativeProjectSettings";
import { serializeCreativeVideoSettingsPatch } from "./creativeVideoSettingsPatch";
import { getProduction, type VideoProduction } from "./videoProduction";
import { getCharacterRefUrl, getStillModel } from "./videoStill";

type HasIndex<Value> = string extends keyof Value ? true : false;
afterEach(() => vi.restoreAllMocks());

describe("creative brand/video boundaries", () => {
  it("exposes closed named brand, reference, video and production models", () => {
    expectTypeOf<HasIndex<BrandBook>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndex<StyleReference>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndex<CreativeVideoSettings>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndex<VideoProduction>>().toEqualTypeOf<false>();
  });

  it("retains brand metadata through the actual read and automatic draft update", () => {
    const kit = getBrandKit({
      brand_book: {
        colors: ["#abc", "red"],
        notes: null,
        source: null,
        name: null,
        provider_note: "Keep",
        fileUrl: "old-upload",
      },
      style_references: [
        { url: "https://example.test/reference", provider: "Keep" },
      ],
    });
    expect(kit.brandBook).toMatchObject({
      colors: ["#abc"],
      notes: "",
      source: "manual",
      provider_note: "Keep",
    });
    expect(kit.styleReferences).toMatchObject([{ provider: "Keep" }]);
    const next = deriveBrandBook({
      existing: kit.brandBook,
      clientName: "Edited",
    });
    expect(next).toMatchObject({ name: "Edited", provider_note: "Keep" });
    expect(next.fileUrl).toBeUndefined();
  });

  it("keeps nullable and unknown-engine legacy defaults safe", () => {
    expect(getBrandKit({ brand_book: null }).brandBook).toBeUndefined();
    expect(
      readCreativeVideoSettings({
        video: { scene_engine: "unknown-paid", sound_engine: "unknown" },
      }),
    ).toMatchObject({ scene_engine: "mock", sound_engine: "elevenlabs" });
    expect(getStillModel({ video: null })).toBe("gpt-image-2.5-sunburst");
    expect(
      getCharacterRefUrl({ video: { character_ref_url: null } }),
    ).toBeUndefined();
  });

  it("validates production fields beyond a recognized status", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      getProduction({ video: { production: { status: "done", error: 42 } } }),
    ).toBeNull();
    expect(diagnostic).toHaveBeenCalledWith(
      "Invalid creative video production",
      { fields: ["error"] },
    );
  });

  it("logs malformed present containers without exposing private input", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    getBrandKit({ style_references: "private" });
    getBrandKit(42);
    readCreativeVideoSettings({ video: [] });
    readCreativeVideoSettings("private");
    expect(diagnostic.mock.calls.map((call) => call[1])).toEqual([
      { fields: ["style_references"] },
      { fields: ["payload"] },
      { fields: ["video"] },
      { fields: ["payload"] },
    ]);
  });

  it("preserves root and nested metadata while applying a concrete video patch", () => {
    const payload = {
      server_revision: 4,
      video: {
        scene_engine: "mock",
        production: { status: "running", worker_cursor: 7 },
        provider_note: "Keep",
      },
    };
    expect(
      serializeCreativeVideoSettingsPatch(payload, {
        scene_engine: "kling",
        character_ref_url: null,
      }),
    ).toMatchObject({
      ...payload,
      video: {
        ...payload.video,
        scene_engine: "kling",
        character_ref_url: null,
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      serializeCreativeVideoSettingsPatch({ video: [] }, {}),
    ).toThrow();
  });
});
