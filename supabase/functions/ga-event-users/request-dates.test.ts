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
    { startDate: startDate ?? "", endDate: endDate ?? "" },
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
      { startDate: "2026-10-24", endDate: "2026-11-07" },
    );
    assertEquals(requestDates({ start_date: "bad" }), {
      startDate: "2020-01-01",
      endDate: "today",
    });
  },
);

Deno.test(
  "an empty period comes back null instead of an inverted range",
  () => {
    assertEquals(
      requestDates({ start_date: "2026-11-01", end_date: "2026-10-31" }),
      null,
    );
  },
);
