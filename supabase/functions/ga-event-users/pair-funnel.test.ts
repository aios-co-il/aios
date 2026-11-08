import { assertEquals } from "jsr:@std/assert@1";
import { pairStepsOf, pairUsers } from "./pair-funnel.ts";

const steps = [
  { event: "ticket_valuation", label: "הערכה" },
  { event: "ticket_upload", label: "העלאה" },
  { event: "ticket_sold", label: "מכירה" },
];

Deno.test("the pair becomes a two-step funnel, in the pair's order", () => {
  assertEquals(
    pairStepsOf(steps, { from: "ticket_valuation", to: "ticket_sold" })?.map(
      (step) => step.event,
    ),
    ["ticket_valuation", "ticket_sold"],
  );
  assertEquals(pairStepsOf(steps, null), null);
});

Deno.test(
  "the funnel gives people at the first step and, of them, the second",
  () => {
    const pair = pairStepsOf(steps, {
      from: "ticket_valuation",
      to: "ticket_sold",
    });
    if (!pair) {
      throw new Error("no pair");
    }
    const row = (step: string, users: string) => ({
      dimensionValues: [{ value: step }],
      metricValues: [{ value: users }],
    });
    assertEquals(
      pairUsers(
        [row("1. ticket_valuation", "27"), row("2. ticket_sold", "6")],
        pair,
      ),
      { from: 27, to: 6 },
    );
  },
);
