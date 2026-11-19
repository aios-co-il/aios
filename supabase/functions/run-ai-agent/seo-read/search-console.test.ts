import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoReadTool } from "./execute.ts";
import {
  CLIENT_ID,
  OTHER_TENANT,
  TENANT,
  clientRow,
  fakeSeoDb,
  pluck,
  seoCtx,
} from "./fake-db.test-fixture.ts";

const SITE = "sc-domain:example.co.il";
/** An active Search Console integration mapping sites to clients. */
function integration(sites: Record<string, string> = { [CLIENT_ID]: SITE }) {
  return {
    tenant_id: TENANT,
    integration_type: "google_search_console",
    is_active: true,
    settings: { client_sites: sites, refresh_token: "secret" },
  };
}
/** A stored Search Console window of the client's property. */
function snapshot(
  period_key: string,
  start: string,
  end: string,
  keywords: Array<unknown>,
  extra = {},
) {
  return {
    tenant_id: TENANT,
    client_id: CLIENT_ID,
    site_url: SITE,
    period_key,
    start_date: start,
    end_date: end,
    synced_at: "2026-11-19T04:00:00Z",
    keywords,
    ...extra,
  };
}
const current = [
  { keyword: "שיפוץ דירה", clicks: 90, impressions: 1000, ctr: 9, position: 2 },
  { keyword: "שיפוץ מטבח", clicks: 0, impressions: 2000, ctr: 0, position: 8 },
];
const monthAgo = [
  {
    keyword: "שיפוץ דירה",
    clicks: 14,
    impressions: 500,
    ctr: 2.8,
    position: 5,
  },
];

/** Runs the tool on a seed. */
function run(seed: Record<string, Array<unknown>>) {
  const db = fakeSeoDb({
    clients: [clientRow()],
    ...(seed as Record<string, Array<Record<string, unknown>>>),
  });
  return {
    db,
    result: executeSeoReadTool(db, seoCtx(), "get_search_console_performance", {
      client_id: CLIENT_ID,
    }),
  };
}

Deno.test(
  "Search Console not connected, not mapped and not synced each say so",
  async () => {
    const notConnected = await run({}).result;
    assertEquals((notConnected as { status: string }).status, "not_connected");
    const unmapped = await run({ tenant_integrations: [integration({})] })
      .result;
    assertEquals((unmapped as { status: string }).status, "no_site_mapped");
    const empty = await run({ tenant_integrations: [integration()] }).result;
    assertEquals((empty as { status: string }).status, "no_data");
  },
);

Deno.test(
  "Search Console totals, per-day change, movers and quick wins come from the stored windows",
  async () => {
    const { db, result } = run({
      tenant_integrations: [integration()],
      gsc_keyword_snapshots: [
        snapshot("current_90d", "2026-08-21", "2026-11-18", current),
        snapshot("prev_month", "2026-09-22", "2026-10-19", monthAgo),
        // Another client's or another tenant's rows of the same property never count.
        snapshot("yearly", "2025-10-22", "2025-11-18", current, {
          client_id: "other",
        }),
        snapshot("three_month", "2026-07-23", "2026-08-19", current, {
          tenant_id: OTHER_TENANT,
        }),
      ],
    });
    const answer = await result;
    assertEquals(at(answer, "status"), "ok");
    assertEquals(at(answer, "site_url"), SITE);
    assertEquals(at(answer, "stale"), false);
    assertEquals(pluck(at(answer, "periods"), "period"), [
      "current_90d",
      "prev_month",
    ]);
    const now = at(answer, "periods", "0");
    const before = at(answer, "periods", "1");
    assertEquals(
      [
        at(now, "days"),
        at(now, "clicks"),
        at(now, "impressions"),
        at(now, "ctr_pct"),
        at(now, "avg_position"),
      ],
      [90, 90, 3000, 3, 6],
    );
    assertEquals(
      [at(now, "clicks_per_day"), at(before, "clicks_per_day")],
      [1, 0.5],
    );
    assertEquals(at(answer, "clicks_per_day_change_pct"), 100);
    assertEquals(at(answer, "top_queries", "0"), {
      query: "שיפוץ דירה",
      clicks: 90,
      impressions: 1000,
      ctr_pct: 9,
      position: 2,
      position_change: 3,
    });
    assertEquals(pluck(at(answer, "striking_distance"), "query"), [
      "שיפוץ מטבח",
    ]);
    assertEquals(JSON.stringify(answer).includes("secret"), false);
    for (const read of db.reads.filter((r) => r.table !== "clients")) {
      assertEquals(read.filters.includes("tenant_id"), true);
    }
  },
);

Deno.test(
  "Search Console falls back to the card's property and flags an old sync",
  async () => {
    const db = fakeSeoDb({
      clients: [clientRow({ gsc_site_url: SITE })],
      tenant_integrations: [integration({})],
      gsc_keyword_snapshots: [
        snapshot("current_90d", "2026-08-21", "2026-11-18", current, {
          synced_at: "2026-11-10T04:00:00Z",
        }),
      ],
    });
    const answer = (await executeSeoReadTool(
      db,
      seoCtx(),
      "get_search_console_performance",
      {
        client_id: CLIENT_ID,
      },
    )) as Record<string, unknown>;
    assertEquals(
      [
        at(answer, "status"),
        at(answer, "stale"),
        at(answer, "clicks_per_day_change_pct"),
      ],
      ["ok", true, null],
    );
  },
);

Deno.test("a failed Search Console read throws", async () => {
  await assertRejects(() =>
    executeSeoReadTool(
      fakeSeoDb(
        { clients: [clientRow()], tenant_integrations: [integration()] },
        ["gsc_keyword_snapshots"],
      ),
      seoCtx(),
      "get_search_console_performance",
      { client_id: CLIENT_ID },
    ),
  );
});
