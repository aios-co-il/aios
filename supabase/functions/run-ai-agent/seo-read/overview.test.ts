import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoReadTool } from "./execute.ts";
import {
  CLIENT_ID,
  TENANT,
  clientRow,
  fakeSeoDb,
  seoCtx,
} from "./fake-db.test-fixture.ts";
import { seoSignals } from "./signals.ts";

const own = { tenant_id: TENANT, client_id: CLIENT_ID };

Deno.test(
  "the overview answers with every source not connected, as signals",
  async () => {
    const db = fakeSeoDb({ clients: [clientRow()] });
    const answer = await executeSeoReadTool(db, seoCtx(), "get_seo_overview", {
      client_id: CLIENT_ID,
    });
    assertEquals(at(answer, "search_console", "status"), "not_connected");
    assertEquals(at(answer, "ahrefs", "status"), "no_data");
    assertEquals(at(answer, "program", "status"), "no_data");
    assertEquals(at(answer, "ai_visibility", "status"), "not_connected");
    assertEquals(at(answer, "signals", "length"), 4);
    assertEquals(
      String(at(answer, "signals", "0")).startsWith("Search Console:"),
      true,
    );
  },
);

Deno.test(
  "one failing source becomes an error section while the others still answer",
  async () => {
    const db = fakeSeoDb(
      {
        clients: [clientRow()],
        seo_monthly_updates: [
          { ...own, month: "2026-10-01", status: "up", work: {} },
        ],
      },
      ["ahrefs_reports"],
    );
    const answer = await executeSeoReadTool(db, seoCtx(), "get_seo_overview", {
      client_id: CLIENT_ID,
    });
    assertEquals(at(answer, "ahrefs", "status"), "error");
    assertEquals(at(answer, "program", "status"), "ok");
    assertEquals(
      at(answer, "program", "monthly_updates", "0", "status_label"),
      "עלייה",
    );
  },
);

Deno.test(
  "signals name drops, quick wins, calendar problems and an AI-visibility fall",
  () => {
    const signals = seoSignals({
      gsc: {
        status: "ok",
        stale: false,
        clicks_per_day_change_pct: -30,
        striking_distance: [{}, {}],
      },
      ahrefs: {
        status: "ok",
        change_vs_3_months_pct: { organic_traffic: 20, referring_domains: 0 },
      },
      program: {
        status: "ok",
        calendar: { failed: [{}], overdue: 2, awaiting_approval: 0 },
        monthly_updates: [{ month: "2026-10-01", status: "down" }],
      },
      ai: { status: "ok", score_change: -15 },
    });
    assertEquals(signals, [
      "ירידה של 30% בקליקים ליום מגוגל (מול חלון לפני חודש).",
      "2 שאילתות במקומות 4–20 עם הרבה חשיפות — הזדמנות לשפר עמודים קיימים.",
      "עלייה של 20% בתנועה האורגנית לפי Ahrefs (מול לפני 3 חודשים).",
      "1 כתבות בלוח התוכן נכשלו בפרסום.",
      "2 כתבות בלוח התוכן עברו את התאריך ולא פורסמו.",
      "העדכון החודשי האחרון (2026-10-01) מסומן כירידה.",
      "ציון הנראות ב-AI ירד ב-15 נקודות מהשבוע הקודם.",
    ]);
  },
);
