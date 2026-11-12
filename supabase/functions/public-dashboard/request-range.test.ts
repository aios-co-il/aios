import { assertEquals } from "jsr:@std/assert@1";
import { sharedDashboardDateRange } from "../_shared/share-links/shared-dashboard-range.ts";
import {
  MAX_CUSTOM_RANGE_DAYS,
  parseRequestRange,
  wooWindowIso,
} from "./request-range.ts";

/** The window a request with these query parameters asks for. */
function parse(query: Record<string, string>) {
  return parseRequestRange(new URLSearchParams(query));
}

Deno.test("a preset reads as every report on the share link reads it", () => {
  assertEquals(parse({ date_filter: "last_7_days" }), {
    ok: true,
    window: {
      dateFilter: "last_7_days",
      ...sharedDashboardDateRange("last_7_days"),
    },
  });
});

Deno.test("no date parameters read the last 30 days", () => {
  const range = parse({});
  assertEquals(range.ok && range.window.dateFilter, "last_30_days");
});

Deno.test("a custom window wins over the preset", () => {
  assertEquals(
    parse({
      date_filter: "last_30_days",
      custom_start: "2026-09-01",
      custom_end: "2026-09-30",
    }),
    {
      ok: true,
      window: {
        dateFilter: "custom",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
    },
  );
});

Deno.test("half a custom window is refused", () => {
  assertEquals(parse({ custom_start: "2026-09-01" }).ok, false);
  assertEquals(parse({ custom_end: "2026-09-30" }).ok, false);
});

Deno.test("days that are not yyyy-MM-dd calendar days are refused", () => {
  for (const day of ["2026-9-01", "01/09/2026", "2026-02-30", "x"]) {
    assertEquals(
      parse({ custom_start: day, custom_end: "2026-09-30" }).ok,
      false,
      day,
    );
  }
});

Deno.test("a window that runs backwards is refused", () => {
  assertEquals(
    parse({ custom_start: "2026-09-30", custom_end: "2026-09-01" }).ok,
    false,
  );
});

Deno.test(
  `a window of ${MAX_CUSTOM_RANGE_DAYS} days is served, one more is not`,
  () => {
    // 2025-01-01 .. 2026-02-04 is 400 days, both ends inclusive.
    assertEquals(
      parse({ custom_start: "2025-01-01", custom_end: "2026-02-04" }).ok,
      true,
    );
    assertEquals(
      parse({ custom_start: "2025-01-01", custom_end: "2026-02-05" }).ok,
      false,
    );
  },
);

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
