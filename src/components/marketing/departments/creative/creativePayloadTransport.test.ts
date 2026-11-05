import { describe, expect, it } from "vitest";
import { serializeCreativeProjectPayload } from "./creativePayloadTransport";

describe("creative project payload transport", () => {
  it.each([
    {
      brand_book: { name: "Brand", provider_note: "Keep" },
      extra: { revision: 3 },
    },
    {
      format: "long-form",
      brief_text: null,
      video: { scene_engine: "unknown-paid" },
    },
    {
      instructions: { legacy: true },
      variations: null,
      storyboard: [{ id: "partial" }],
    },
    {
      optional: undefined,
      array: [undefined, null, 42],
      nested: { omitted: undefined },
    },
    { duration: NaN, at: new Date("2026-11-05T00:00:00Z") },
  ])(
    "keeps the existing request body's JSON representation for %j",
    (payload) => {
      const existingBody = JSON.stringify({ payload });
      const typedBody = JSON.stringify({
        payload: serializeCreativeProjectPayload(payload),
      });
      expect(typedBody).toBe(existingBody);
    },
  );

  it("retains every stored root and nested metadata field without adding defaults", () => {
    expect(
      serializeCreativeProjectPayload({
        worker_cursor: 7,
        video: { provider_note: "Keep", scene_engine: "unknown-paid" },
        copy_variations: [{ text: "Untrimmed  ", worker_note: "Keep" }],
      }),
    ).toEqual({
      worker_cursor: 7,
      video: { provider_note: "Keep", scene_engine: "unknown-paid" },
      copy_variations: [{ text: "Untrimmed  ", worker_note: "Keep" }],
    });
  });
});
