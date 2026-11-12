import { assertEquals } from "jsr:@std/assert@1";
import type { SharedRecordRow } from "./event-totals.ts";
import {
  fetchWindowRecords,
  type LoadWindowPage,
  MAX_UNBOUNDED_ROWS,
  MAX_WINDOW_ROWS,
  recordWindowFilter,
} from "./window-records.ts";

/** A September row with this id. */
function row(id: number): SharedRecordRow {
  return {
    id: String(id),
    data: { date: "2026-09-01" },
    created_at: "2026-09-02T00:00:00Z",
  };
}

/** A table of `total` rows, served a page at a time; records each call. */
function tableOf(total: number): {
  calls: Array<{ filter: string | null; from: number; to: number }>;
  loadPage: LoadWindowPage;
} {
  const calls: Array<{ filter: string | null; from: number; to: number }> = [];
  return {
    calls,
    loadPage(filter, from, to) {
      calls.push({ filter, from, to });
      const length = Math.max(0, Math.min(to, total - 1) - from + 1);
      const data = Array.from({ length }, (_, i) => row(from + i));
      return Promise.resolve({ data, error: null });
    },
  };
}

const SEPTEMBER = {
  tableId: "t1",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
};

Deno.test(
  "the filter keeps rows dated in the window, by date then date_start, and undated rows",
  () => {
    assertEquals(
      recordWindowFilter("2026-09-01", "2026-09-30"),
      "and(data->>date.gte.2026-09-01,data->>date.lte.2026-09-30)," +
        "and(data->>date.is.null,data->>date_start.gte.2026-09-01,data->>date_start.lte.2026-09-30)," +
        "and(data->>date.is.null,data->>date_start.is.null)",
    );
  },
);

Deno.test("an all-time window has no filter", () => {
  assertEquals(recordWindowFilter(null, null), null);
});

Deno.test("the window filter goes to every page query", async () => {
  const { calls, loadPage } = tableOf(2500);
  const rows = await fetchWindowRecords(loadPage, SEPTEMBER);
  assertEquals(rows.length, 2500);
  assertEquals(
    calls.map((call) => call.from),
    [0, 1000, 2000],
  );
  const filter = recordWindowFilter("2026-09-01", "2026-09-30");
  assertEquals(
    calls.every((call) => call.filter === filter),
    true,
  );
});

Deno.test("a dated window reads past the old 4,000-row cap", async () => {
  const { loadPage } = tableOf(6500);
  const rows = await fetchWindowRecords(loadPage, SEPTEMBER);
  assertEquals(rows.length, 6500);
});

Deno.test("reaching the cap stops the read and logs it", async () => {
  const { loadPage } = tableOf(MAX_WINDOW_ROWS + 500);
  const logged: Array<string> = [];
  const original = console.error;
  console.error = (...args: Array<unknown>) => logged.push(args.join(" "));
  try {
    const rows = await fetchWindowRecords(loadPage, SEPTEMBER);
    assertEquals(rows.length, MAX_WINDOW_ROWS);
  } finally {
    console.error = original;
  }
  assertEquals(logged.length, 1);
  assertEquals(logged[0].includes("row cap"), true);
});

Deno.test(
  "an all-time read keeps the newest rows under the old cap",
  async () => {
    const { calls, loadPage } = tableOf(9000);
    const original = console.error;
    console.error = () => {};
    try {
      const rows = await fetchWindowRecords(loadPage, {
        tableId: "t1",
        startDate: null,
        endDate: null,
      });
      assertEquals(rows.length, MAX_UNBOUNDED_ROWS);
    } finally {
      console.error = original;
    }
    assertEquals(calls[0].filter, null);
  },
);

Deno.test("a read error returns the rows read so far", async () => {
  let call = 0;
  const original = console.error;
  console.error = () => {};
  try {
    const rows = await fetchWindowRecords(() => {
      call++;
      return Promise.resolve(
        call === 1
          ? {
              data: Array.from({ length: 1000 }, (_, i) => row(i)),
              error: null,
            }
          : { data: null, error: { message: "timeout" } },
      );
    }, SEPTEMBER);
    assertEquals(rows.length, 1000);
  } finally {
    console.error = original;
  }
});
