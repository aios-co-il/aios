import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { pulseBriefInstructions, pulseLineText } from "./pulse-brief.ts";

const line = {
  client: "איימי בכור",
  agency: "promo",
  status: "healthy",
  isEcommerce: false,
  spend: 2007.97,
  leads: 14,
  cpl: 118.17,
  cplChangePct: -17.8,
  purchases: null,
  roas: null,
};

Deno.test(
  "a lead client reads as leads, cost per lead with its change, and spend",
  () => {
    assertEquals(
      pulseLineText(line),
      "- איימי בכור (promo): 🟢 14 לידים, ₪118 לליד (-18%), הוצאה ₪2008",
    );
  },
);

Deno.test("an ecommerce client reads as purchases and ROAS", () => {
  assertEquals(
    pulseLineText({
      ...line,
      client: "חנות",
      agency: null,
      status: "critical",
      isEcommerce: true,
      purchases: 12,
      roas: 3.4,
      spend: 900,
    }),
    "- חנות: 🔴 12 רכישות, ROAS 3.4, הוצאה ₪900",
  );
});

Deno.test("the brief says to answer from it without the brain", () => {
  const text = pulseBriefInstructions({
    calculatedAt: "2026-11-10T06:00:00Z",
    lines: [line],
  });
  assertStringIncludes(text, "=== דופק הקמפיינים");
  assertStringIncludes(text, "- איימי בכור (promo): 🟢");
  assertStringIncludes(text, "עני מכאן מיד, בלי ask_carmen");
});
