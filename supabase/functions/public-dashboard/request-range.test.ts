import { assertEquals } from "jsr:@std/assert@1";
import { wooWindowIso } from "./request-range.ts";

Deno.test("a custom window reads WooCommerce orders by Jerusalem days", () => {
  assertEquals(
    wooWindowIso({
      dateFilter: "custom",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    }),
    {
      start: "2026-08-31T21:00:00.000Z",
      end: "2026-09-30T20:59:59.999Z",
    },
  );
});
