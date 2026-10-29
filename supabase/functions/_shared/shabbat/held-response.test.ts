import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { shabbatHeldResponse } from "./held-response.ts";

const SATURDAY_11 = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_0829 = new Date("2026-11-01T06:29:00Z");
const SUNDAY_0830 = new Date("2026-11-01T06:30:00Z");
const CORS = { "Access-Control-Allow-Origin": "*" };

Deno.test("shabbatHeldResponse", async (t) => {
  await t.step(
    "inside the window a worker answers held and claims nothing",
    async () => {
      for (const now of [SATURDAY_11, SUNDAY_0829]) {
        const response = shabbatHeldResponse(CORS, now);
        assert(response);
        assertStrictEquals(response.status, 200);
        assertStrictEquals(
          response.headers.get("Content-Type"),
          "application/json",
        );
        assertStrictEquals(
          response.headers.get("Access-Control-Allow-Origin"),
          "*",
        );
        assertEquals(await response.json(), {
          ok: true,
          held: "shabbat",
          hold_until: SUNDAY_0830.toISOString(),
          processed: 0,
          results: [],
          errors: [],
        });
      }
    },
  );

  await t.step("from Sunday 08:30 the worker runs as usual", () => {
    assertStrictEquals(shabbatHeldResponse(CORS, SUNDAY_0830), null);
    const wednesday = new Date("2026-10-28T07:00:00Z");
    assertStrictEquals(shabbatHeldResponse(CORS, wednesday), null);
  });
});
