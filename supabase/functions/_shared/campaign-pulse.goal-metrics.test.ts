import { assertStrictEquals } from "jsr:@std/assert@1";
import { computeGoalMetricsFromRecords } from "./campaign-pulse.ts";

Deno.test("google ecommerce rows count conversions as purchases", () => {
  const metrics = computeGoalMetricsFromRecords(
    [
      {
        data: {
          date: "2026-10-22",
          cost: 100,
          conversions: 2,
          conversions_value: 500,
        },
      },
      {
        data: {
          date: "2026-10-23",
          cost: 100,
          conversions: 1,
          conversions_value: 300,
        },
      },
    ],
    "ecommerce",
    "2026-10-17",
    "2026-10-10",
  );
  assertStrictEquals(metrics.outcomes, 3);
  assertStrictEquals(metrics.revenue, 800);
  assertStrictEquals(metrics.efficiency, 4);
});
