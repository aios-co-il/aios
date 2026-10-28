import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "./budget.ts";

Deno.test("RoundBudget", async (t) => {
  let now = 1_000;
  const clock = () => now;

  await t.step("counts time down and never below zero", () => {
    const budget = RoundBudget.create(100, 0, clock);
    assertEquals(budget.hasTime(100), true);
    now += 60;
    assertEquals(budget.remainingMs(), 40);
    assertEquals(budget.hasTime(50), false);
    now += 100;
    assertEquals(budget.remainingMs(), 0);
  });

  await t.step(
    "a slice ends no later than its parent and shares API calls",
    () => {
      now = 0;
      const budget = RoundBudget.create(100, 2, clock);
      const slice = budget.slice(500);
      assertEquals(slice.remainingMs(), 100);
      assertEquals(budget.slice(30).remainingMs(), 30);
      assertEquals(slice.takeApiCall(), true);
      assertEquals(budget.takeApiCall(), true);
      assertEquals(slice.takeApiCall(), false);
      assertEquals(budget.takeApiCall(), false);
    },
  );
});
