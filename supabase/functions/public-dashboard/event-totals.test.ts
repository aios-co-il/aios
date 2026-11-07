import { assertEquals } from "jsr:@std/assert@1";
import {
  fetchEventTotals,
  type SharedRecordRow,
  withFullEventTotals,
} from "./event-totals.ts";

const row = (id: string, report_type: string): SharedRecordRow => ({
  id,
  data: { report_type },
  created_at: "2026-11-07T00:00:00Z",
});

Deno.test(
  "event totals are read page by page past the 4,000-row cap",
  async () => {
    const total = 4500;
    const pages: Array<[number, number]> = [];
    const rows = await fetchEventTotals((from, to) => {
      pages.push([from, to]);
      const data = Array.from(
        { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
        (_, i) => row(String(from + i), "event_total"),
      );
      return Promise.resolve({ data, error: null });
    });
    assertEquals(rows.length, 4500);
    assertEquals(pages.length, 5);
  },
);

Deno.test("a read error stops at the rows read so far", async () => {
  let call = 0;
  const rows = await fetchEventTotals(() => {
    call++;
    return Promise.resolve(
      call === 1
        ? {
            data: Array.from({ length: 1000 }, (_, i) =>
              row(String(i), "event_total"),
            ),
            error: null,
          }
        : { data: null, error: { message: "timeout" } },
    );
  });
  assertEquals(rows.length, 1000);
});

Deno.test(
  "the full event read replaces the capped one, keeping other rows",
  () => {
    const merged = withFullEventTotals(
      [row("a", "daily"), row("b", "event_total"), row("c", "top_pages")],
      [row("b", "event_total"), row("d", "event_total")],
    );
    assertEquals(
      merged.map((r) => r.id),
      ["a", "c", "b", "d"],
    );
  },
);
