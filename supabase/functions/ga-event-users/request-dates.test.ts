import { assertEquals } from "jsr:@std/assert@1";
import { sharedDashboardDateRange } from "../_shared/share-links/shared-dashboard-range.ts";
import { requestDates } from "./request-dates.ts";

Deno.test("a share link reads the same dates as its other reports", () => {
  const { startDate, endDate } = sharedDashboardDateRange("last_7_days");
  assertEquals(
    requestDates({
      share_token: "tok",
      date_filter: "last_7_days",
      start_date: "2026-01-01",
      end_date: "2026-01-02",
    }),
    { ok: true, dates: { startDate: startDate ?? "", endDate: endDate ?? "" } },
  );
});

Deno.test("a share link's custom window reads its own days", () => {
  assertEquals(
    requestDates({
      share_token: "tok",
      date_filter: "custom",
      custom_start: "2026-09-01",
      custom_end: "2026-09-30",
    }),
    { ok: true, dates: { startDate: "2026-09-01", endDate: "2026-09-30" } },
  );
});

Deno.test("a share link's backwards or half custom window is refused", () => {
  assertEquals(
    requestDates({
      share_token: "tok",
      custom_start: "2026-09-30",
      custom_end: "2026-09-01",
    }).ok,
    false,
  );
  assertEquals(
    requestDates({ share_token: "tok", custom_start: "2026-09-01" }).ok,
    false,
  );
});

Deno.test(
  "the signed-in dashboard's dates are used as sent, else all time",
  () => {
    assertEquals(
      requestDates({
        start_date: "2026-10-24",
        end_date: "2026-11-07",
      }),
      { ok: true, dates: { startDate: "2026-10-24", endDate: "2026-11-07" } },
    );
    assertEquals(requestDates({ start_date: "bad" }), {
      ok: true,
      dates: { startDate: "2020-01-01", endDate: "today" },
    });
  },
);

Deno.test(
  "an empty period comes back without dates instead of an inverted range",
  () => {
    assertEquals(
      requestDates({ start_date: "2026-11-01", end_date: "2026-10-31" }),
      { ok: true, dates: null },
    );
  },
);
