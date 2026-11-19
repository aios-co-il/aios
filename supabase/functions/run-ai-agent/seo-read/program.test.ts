import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoReadTool } from "./execute.ts";
import {
  CLIENT_ID,
  TENANT,
  clientRow,
  fakeSeoDb,
  seoCtx,
} from "./fake-db.test-fixture.ts";

const own = { tenant_id: TENANT, client_id: CLIENT_ID };
/** A content-calendar entry of the latest plan. */
function entry(
  scheduled_date: string,
  title: string,
  generation_status: string,
  extra = {},
) {
  return {
    ...own,
    work_item_id: "wi-new",
    scheduled_date,
    title,
    primary_keyword: title,
    approval_status: "approved",
    generation_status,
    ...extra,
  };
}
const seed = {
  seo_geo_programs: [
    {
      ...own,
      work_item_id: "wi-old",
      auto_approve: false,
      horizon_months: 3,
      updated_at: "2026-01-01",
    },
    {
      ...own,
      work_item_id: "wi-new",
      auto_approve: true,
      horizon_months: 6,
      wordpress_site_id: "wp",
      updated_at: "2026-10-01",
    },
  ],
  seo_geo_keywords: [
    {
      ...own,
      work_item_id: "wi-new",
      keyword: "שיפוץ דירה",
      priority: "high",
      promoted: true,
      sort_order: 1,
    },
    {
      ...own,
      work_item_id: "wi-new",
      keyword: "שיפוץ מטבח",
      priority: "medium",
      promoted: true,
      sort_order: 2,
    },
    {
      ...own,
      work_item_id: "wi-new",
      keyword: "לא בתוכנית",
      priority: "low",
      promoted: false,
      sort_order: 3,
    },
    {
      ...own,
      work_item_id: "wi-old",
      keyword: "תוכנית ישנה",
      priority: "high",
      promoted: true,
      sort_order: 0,
    },
  ],
  seo_geo_calendar_entries: [
    entry("2026-11-01", "פורסם", "published", {
      published_at: "2026-11-01T08:00:00Z",
      live_url: "https://example.co.il/p",
    }),
    entry("2026-11-05", "נכשל", "failed", { publish_error: "WordPress 401" }),
    entry("2026-11-10", "באיחור", "draft"),
    entry("2026-11-25", "הבא", "planned", { approval_status: "pending" }),
  ],
  seo_monthly_updates: [
    {
      ...own,
      month: "2026-10-01",
      status: "down",
      notes: "ירידה אחרי עדכון ליבה",
      work: { summary: "תיקוני מהירות", articles: [1, 2], links: [1] },
    },
  ],
};

/** Runs get_seo_program on a seed. */
async function run(
  tables: Record<string, Array<Record<string, unknown>>>,
  fail: Array<string> = [],
) {
  const db = fakeSeoDb({ clients: [clientRow()], ...tables }, fail);
  return await executeSeoReadTool(db, seoCtx(), "get_seo_program", {
    client_id: CLIENT_ID,
  });
}

Deno.test(
  "a client without a program, calendar or monthly update says so",
  async () => {
    const answer = await run({});
    assertEquals(at(answer, "status"), "no_data");
  },
);

Deno.test(
  "the program reads the latest plan's keywords and calendar, and the monthly updates",
  async () => {
    const answer = await run(seed);
    assertEquals(at(answer, "program", "horizon_months"), 6);
    assertEquals(at(answer, "program", "wordpress_connected"), true);
    assertEquals(at(answer, "keywords", "count"), 2);
    assertEquals(at(answer, "keywords", "by_priority"), { high: 1, medium: 1 });
    const calendar = at(answer, "calendar");
    assertEquals(at(calendar, "total"), 4);
    assertEquals(at(calendar, "by_status"), {
      פורסם: 1,
      נכשל: 1,
      טיוטה: 1,
      מתוכנן: 1,
    });
    assertEquals(
      [at(calendar, "overdue"), at(calendar, "awaiting_approval")],
      [1, 1],
    );
    assertEquals(at(calendar, "upcoming"), [
      {
        date: "2026-11-25",
        title: "הבא",
        keyword: "הבא",
        status: "מתוכנן",
        approved: false,
      },
    ]);
    assertEquals(
      at(calendar, "recently_published", "0", "url"),
      "https://example.co.il/p",
    );
    assertEquals(at(calendar, "failed", "0", "error"), "WordPress 401");
    assertEquals(at(answer, "monthly_updates", "0"), {
      month: "2026-10-01",
      status: "down",
      status_label: "ירידה",
      notes: "ירידה אחרי עדכון ליבה",
      work_summary: "תיקוני מהירות",
      onsite_items: 0,
      articles: 2,
      links: 1,
    });
  },
);

Deno.test("a failed program read throws", async () => {
  await assertRejects(() => run(seed, ["seo_geo_calendar_entries"]));
});
