import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readAiosCampaignRows } from "./tables.ts";

type Call = { method: string; args: unknown[] };

/** A PostgREST-style builder that records calls and answers each `range` with the next page. */
function pagedDb(pages: Array<Array<Record<string, unknown>>>) {
  const calls: Call[] = [];
  let pageIndex = 0;
  const db = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lte", "or", "order"]) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ method: m, args });
          return builder;
        };
      }
      builder.range = (...args: unknown[]) => {
        calls.push({ method: "range", args });
        return Promise.resolve({ data: pages[pageIndex++] || [], error: null });
      };
      return builder;
    },
  };
  return { db, calls };
}

/** Stored record r<i>: campaign i, 1 spend on Oct 20. */
const rec = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `r${i}`,
  data: {
    date: "2026-10-20",
    campaign_id: String(i),
    campaign_name: `C${i}`,
    spend: 1,
    ...extra,
  },
});

describe("readAiosCampaignRows", () => {
  it("reads page by page until a short page; legacy rows count as campaign", async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => rec(i));
    const page2 = [
      rec(3),
      rec(4, { entity_level: "campaign" }),
      // The filter should have kept these out; they are dropped if they slip through.
      rec(5, { entity_level: "ad" }),
    ];
    const page3 = [rec(6)];
    const { db, calls } = pagedDb([page1, page2, page3]);
    const rows = await readAiosCampaignRows(
      db,
      "table-1",
      "2026-10-19",
      "2026-10-25",
      3,
    );
    assertEquals(
      rows.map((r) => r.campaign_id),
      ["0", "1", "2", "3", "4", "6"],
    );
    assertEquals(
      calls.filter((c) => c.method === "range").map((c) => c.args),
      [
        [0, 2],
        [3, 5],
        [6, 8],
      ],
    );
    const or = calls.find((c) => c.method === "or");
    assertEquals(or?.args, [
      "data->>entity_level.is.null,data->>entity_level.eq.campaign",
    ]);
    const order = calls.find((c) => c.method === "order");
    assertEquals(order?.args, ["id", { ascending: true }]);
  });
});
