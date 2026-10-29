import { describe, expect, it } from "vitest";
import {
  googleGoalPresence,
  googleReportFallbackGoal,
} from "./googleGoalPresence";

const googleTable = (id: string, settings: Record<string, unknown> = {}) => ({
  id,
  integration_type: "google_ads",
  integration_settings: settings,
});

describe("googleGoalPresence", () => {
  it("reports the goals present, or the fallback's when there are none", () => {
    expect(googleGoalPresence(["leads", "leads"], "ecommerce")).toEqual({
      hasEcommerce: false,
      hasLeads: true,
    });
    expect(googleGoalPresence([], "ecommerce")).toEqual({
      hasEcommerce: true,
      hasLeads: false,
    });
  });
});

describe("googleReportFallbackGoal", () => {
  it("is ecommerce when a Google table is set to ecommerce", () => {
    expect(
      googleReportFallbackGoal([
        googleTable("f", { campaign_type: "ecommerce" }),
        googleTable("g"),
      ]),
    ).toBe("ecommerce");
    expect(
      googleReportFallbackGoal([
        { integration_settings: { campaign_type: "ecommerce" } },
      ]),
    ).toBe("leads");
  });
});
