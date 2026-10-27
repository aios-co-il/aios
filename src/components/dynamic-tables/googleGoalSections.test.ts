import { describe, expect, it } from "vitest";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";
import { googleGoalSections } from "./googleGoalSections";

const row = (
  key: string,
  goal: GoogleCampaignGoal,
  conversions = 0,
  conversions_value = 0,
) => ({ key, goal, conversions, conversions_value });

describe("googleGoalSections", () => {
  it("puts sales before leads and leaves out a goal without campaigns", () => {
    const rows = [
      row("search", "leads"),
      row("pmax", "ecommerce"),
      row("brand", "leads"),
    ];
    expect(
      googleGoalSections(rows, "leads").sections.map((section) => [
        section.goal,
        section.rows.map((r) => r.key),
      ]),
    ).toStrictEqual([
      ["ecommerce", ["pmax"]],
      ["leads", ["search", "brand"]],
    ]);
    expect(
      googleGoalSections(rows.slice(0, 1), "ecommerce").sections.map(
        (section) => section.goal,
      ),
    ).toStrictEqual(["leads"]);
  });

  it("an empty report keeps one table of its own goal", () => {
    const split = googleGoalSections([], "ecommerce");
    expect(split.sections).toStrictEqual([{ goal: "ecommerce", rows: [] }]);
    expect(split.isEcommerce).toBe(true);
    expect(split.mixedGoals).toBe(false);
  });

  it("a mixed report keeps Google's sales totals apart from lead conversions", () => {
    const split = googleGoalSections(
      [
        row("pmax", "ecommerce", 2, 500),
        row("search", "leads", 3, 3),
        row("shopping", "ecommerce", 1, 200),
      ],
      "leads",
    );
    expect(split.mixedGoals).toBe(true);
    expect(split.isEcommerce).toBe(false);
    expect(split.ecommerceTotals).toStrictEqual({
      conversions: 3,
      conversions_value: 700,
    });
  });

  it("is a sales report only when every row is a sales row", () => {
    expect(
      googleGoalSections([row("pmax", "ecommerce")], "leads").isEcommerce,
    ).toBe(true);
    expect(
      googleGoalSections([row("search", "leads")], "ecommerce").isEcommerce,
    ).toBe(false);
  });
});
