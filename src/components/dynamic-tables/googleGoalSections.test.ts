import { describe, expect, it } from "vitest";
import type { GoogleReportCampaignGoal } from "@/lib/pulseCampaignGoals";
import { googleGoalSections } from "./googleGoalSections";

describe("googleGoalSections", () => {
  it("puts sales before leads and leaves out a goal without campaigns", () => {
    const rows: Array<{ key: string; goal: GoogleReportCampaignGoal }> = [
      { key: "search", goal: "leads" },
      { key: "pmax", goal: "ecommerce" },
      { key: "brand", goal: "leads" },
    ];
    expect(
      googleGoalSections(rows, "leads").map((section) => [
        section.goal,
        section.rows.map((row) => row.key),
      ]),
    ).toStrictEqual([
      ["ecommerce", ["pmax"]],
      ["leads", ["search", "brand"]],
    ]);
    expect(
      googleGoalSections(rows.slice(0, 1), "ecommerce").map((s) => s.goal),
    ).toStrictEqual(["leads"]);
  });

  it("an empty report keeps one table of its own goal", () => {
    expect(googleGoalSections([], "ecommerce")).toStrictEqual([
      { goal: "ecommerce", rows: [] },
    ]);
  });
});
