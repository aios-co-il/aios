import { describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  readSeoPayload,
  type ContentPlanItem,
  type SeoPayload,
  type SeoPlan,
} from "./seoPayload";

describe("validated SEO payload reads", () => {
  test("exposes closed top-level and nested domain contracts", () => {
    expectTypeOf<
      string extends keyof SeoPayload ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      string extends keyof SeoPlan ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      string extends keyof NonNullable<SeoPlan["strategy"]> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      string extends keyof ContentPlanItem ? true : false
    >().toEqualTypeOf<false>();
  });

  test("retains the assigned-SEO null-plan sentinel", () => {
    expect(readSeoPayload({ seo_plan: null })).toEqual({ seo_plan: null });
  });

  test("validates known fields without deleting opaque stored metadata", () => {
    const stored = {
      future: { flag: true },
      seo_plan: {
        strategy: { objective: "Known", provider: { model: "x" } },
        contentPlan: [{ title: "Article", provider: "keep" }],
      },
    };
    expect(readSeoPayload(stored)).toEqual(stored);
  });

  test("logs and rejects malformed known nested fields", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      readSeoPayload({ seo_plan: { contentPlan: [{ geoQuestions: [7] }] } }),
    ).toThrow("SEO");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
