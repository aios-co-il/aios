import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  noResultsFindingReason,
  noResultsReason,
  noResultsStatus,
  noResultsWindowStart,
  resolveNoResultsDays,
} from "./no-results-window.ts";

Deno.test("resolveNoResultsDays", async (t) => {
  await t.step("a missing or non-numeric value is the default 7", () => {
    for (const raw of [undefined, null, "", "abc", Number.NaN]) {
      assertStrictEquals(resolveNoResultsDays(raw), 7, String(raw));
    }
  });

  await t.step("a stored value is used as is", () => {
    assertStrictEquals(resolveNoResultsDays(3), 3);
    assertStrictEquals(resolveNoResultsDays("14"), 14);
  });

  await t.step("a value outside 1–30 is clamped into the range", () => {
    assertStrictEquals(resolveNoResultsDays(0), 1);
    assertStrictEquals(resolveNoResultsDays(-4), 1);
    assertStrictEquals(resolveNoResultsDays(45), 30);
    assertStrictEquals(resolveNoResultsDays(2.6), 3);
  });
});

Deno.test("noResultsWindowStart ends the window on the last full day", () => {
  assertStrictEquals(noResultsWindowStart("2026-11-06", 1), "2026-11-06");
  assertStrictEquals(noResultsWindowStart("2026-11-06", 3), "2026-11-04");
  assertStrictEquals(noResultsWindowStart("2026-11-06", 7), "2026-10-31");
});

Deno.test("noResultsReason keeps the 7-day text the pulse always sent", () => {
  assertStrictEquals(
    noResultsReason(7),
    "קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים",
  );
  assertStrictEquals(
    noResultsReason(3),
    "קיימת הוצאה ללא תוצאות ב־3 הימים המלאים האחרונים",
  );
});

Deno.test(
  "noResultsFindingReason: every window's reason is one finding",
  () => {
    assertStrictEquals(
      noResultsFindingReason(noResultsReason(3), 3),
      noResultsReason(7),
    );
    assertStrictEquals(
      noResultsFindingReason(noResultsReason(7), undefined),
      noResultsReason(7),
    );
    assertStrictEquals(
      noResultsFindingReason("חריגה מתמשכת מהיעד המאושר (CPL 30)", 3),
      "חריגה מתמשכת מהיעד המאושר (CPL 30)",
    );
  },
);

Deno.test("noResultsStatus", async (t) => {
  const zero = { spend: 50, outcomes: 0 };
  const results = { spend: 50, outcomes: 4 };

  await t.step("spend with 0 results in the client's window alerts", () => {
    assertEquals(noResultsStatus(3, zero, results), {
      status: "critical",
      tier: "exception",
      reason: noResultsReason(3),
      alertEligible: true,
    });
  });

  await t.step(
    "a short window also alerts on 7 days without results, as before",
    () => {
      const noSpendInWindow = { spend: 0, outcomes: 0 };
      assertStrictEquals(
        noResultsStatus(1, noSpendInWindow, zero)?.alertEligible,
        true,
      );
    },
  );

  await t.step("a long window holds 7 days without results as a watch", () => {
    const watch = noResultsStatus(14, results, zero);
    assertStrictEquals(watch?.alertEligible, false);
    assertStrictEquals(watch?.tier, "watch");
    assertStrictEquals(watch?.status, "warning");
  });

  await t.step("results, or a missing result count, leave the rule", () => {
    assertStrictEquals(noResultsStatus(7, results, results), null);
    const missing = { spend: 50, outcomes: null };
    assertStrictEquals(noResultsStatus(3, missing, missing), null);
  });
});
