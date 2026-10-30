import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import { readFbInsightsPage } from "./fbInsightsPage.ts";

Deno.test("readFbInsightsPage keeps Graph rows and the next page url", () => {
  const page = readFbInsightsPage({
    data: [
      {
        campaign_id: "1",
        campaign_name: "C",
        date_start: "2026-01-01",
        spend: "1.5",
        impressions: "10",
        actions: [{ action_type: "lead", value: "2" }],
      },
    ],
    paging: { next: "https://graph.example/next" },
  });
  assertStrictEquals(page.next, "https://graph.example/next");
  assertStrictEquals(page.rows[0].campaign_id, "1");
  assertStrictEquals(page.rows[0].spend, "1.5");
  assertStrictEquals(page.rows[0].reach, "");
  assertStrictEquals(page.rows[0].adset_id, undefined);
  assertEquals(page.rows[0].actions, [{ action_type: "lead", value: "2" }]);
  assertStrictEquals(page.rows[0].conversions, undefined);
});

Deno.test("readFbInsightsPage throws the Graph error message", () => {
  assertThrows(
    () => readFbInsightsPage({ error: { message: "bad token" } }),
    Error,
    "bad token",
  );
  assertThrows(
    () => readFbInsightsPage({ error: { code: 1 } }),
    Error,
    `"code":1`,
  );
});

Deno.test("readFbInsightsPage tolerates non-object bodies", () => {
  assertEquals(readFbInsightsPage(null), { rows: [], next: null });
  assertEquals(readFbInsightsPage({ data: "x" }), { rows: [], next: null });
});
