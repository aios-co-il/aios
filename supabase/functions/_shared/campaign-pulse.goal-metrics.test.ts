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

const D7 = "2026-10-17";
const D14 = "2026-10-10";
const metricsOf = (
  goal: "leads" | "ecommerce",
  ...rows: Array<Record<string, unknown>>
) =>
  computeGoalMetricsFromRecords(
    rows.map((data) => ({ data: { date: "2026-10-20", ...data } })),
    goal,
    D7,
    D14,
  );

Deno.test(
  "client-level results are the ones the report counts for the goal",
  async (t) => {
    await t.step("a WhatsApp campaign's conversations are its leads", () => {
      const metrics = metricsOf("leads", {
        spend: 100,
        leads: 0,
        conversations: 5,
      });
      assertStrictEquals(metrics.outcomes, 5);
      assertStrictEquals(metrics.efficiency, 20);
    });

    await t.step("Meta form leads count without a leads field", () => {
      assertStrictEquals(
        metricsOf("leads", { spend: 90, form_leads: 3 }).outcomes,
        3,
      );
    });

    await t.step(
      "Google all_conversions is not a lead the report shows",
      () => {
        const metrics = metricsOf("leads", { cost: 50, all_conversions: 4 });
        assertStrictEquals(metrics.spend, 50);
        assertStrictEquals(metrics.outcomes, 0);
        assertStrictEquals(metrics.efficiency, null);
      },
    );

    await t.step("a zero purchases field falls back to conversions", () => {
      assertStrictEquals(
        metricsOf("ecommerce", { cost: 100, purchases: 0, conversions: 2 })
          .outcomes,
        2,
      );
    });

    await t.step("a bare revenue field is not the report's revenue", () => {
      const metrics = metricsOf("ecommerce", {
        spend: 100,
        purchases: 1,
        revenue: 300,
      });
      assertStrictEquals(metrics.revenue, 0);
      assertStrictEquals(metrics.efficiency, 0);
    });

    await t.step("a zero spend field falls back to cost", () => {
      assertStrictEquals(
        metricsOf("leads", { spend: 0, cost: 40, leads: 2 }).spend,
        40,
      );
    });
  },
);
