import { describe, expect, it } from "vitest";
import { splitGoogleGroupsByGoal } from "./splitGoogleGroupsByGoal";

const group = (
  goal: "ecommerce" | "leads",
  cost: number,
  conversions: number,
  conversions_value: number,
) => ({ goal, cost, conversions, conversions_value });

describe("splitGoogleGroupsByGoal", () => {
  it("keeps totals per goal for a mixed table", () => {
    const split = splitGoogleGroupsByGoal(
      [
        group("ecommerce", 100, 2, 500),
        group("leads", 60, 3, 3),
        group("ecommerce", 40, 1, 200),
      ],
      false,
    );
    expect(split.mixedGoals).toBe(true);
    expect(split.isEcommerce).toBe(false);
    expect(split.ecommerceTotals).toEqual({
      cost: 140,
      conversions: 3,
      conversions_value: 700,
    });
    expect(split.leadTotals).toEqual({
      cost: 60,
      conversions: 3,
      conversions_value: 3,
    });
  });

  it("is ecommerce only when every row is a sales row, or by table type when empty", () => {
    expect(
      splitGoogleGroupsByGoal([group("ecommerce", 1, 1, 1)], false).isEcommerce,
    ).toBe(true);
    expect(
      splitGoogleGroupsByGoal([group("leads", 1, 1, 1)], true).isEcommerce,
    ).toBe(false);
    expect(splitGoogleGroupsByGoal([], true).isEcommerce).toBe(true);
    expect(splitGoogleGroupsByGoal([], true).mixedGoals).toBe(false);
  });
});
