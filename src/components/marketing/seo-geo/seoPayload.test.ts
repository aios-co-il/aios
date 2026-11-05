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

  test("normalizes unavailable data emitted by marketing-seo-plan", () => {
    expect(
      readSeoPayload({
        seo_plan: {
          strategy: { currentState: null, objective: "Grow" },
          clusters: [
            { evidence: null, supportingKeywords: null, priority: null },
          ],
          contentPlan: [{ title: "Article", geoQuestions: null }],
          geo: null,
          technicalPriorities: null,
          dataNotes: null,
        },
      }),
    ).toEqual({
      seo_plan: {
        strategy: { currentState: undefined, objective: "Grow" },
        clusters: [
          {
            evidence: undefined,
            supportingKeywords: undefined,
            priority: undefined,
          },
        ],
        contentPlan: [{ title: "Article", geoQuestions: undefined }],
        geo: undefined,
        technicalPriorities: undefined,
        dataNotes: undefined,
      },
    });
  });

  test("accepts the empty-copy null sentinel preserved when a work item becomes SEO", () => {
    expect(readSeoPayload({ department: "seo", copy_text: null })).toEqual({
      department: "seo",
      copy_text: undefined,
    });
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
