import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { throwIfError } from "./context.ts";
import { clip } from "./numbers.ts";

const GENERATION_LABELS: Record<string, string> = {
  planned: "מתוכנן",
  generating: "בכתיבה",
  draft: "טיוטה",
  published: "פורסם",
  failed: "נכשל",
};
const NOT_YET_PUBLISHED = ["planned", "generating", "draft"];

type Scope = {
  db: SeoDb;
  ctx: SeoToolContext;
  client: SeoClient;
  workItemId: string | null;
};

/**
 * The content calendar. Every count is its own count query over all entries
 * (per generation status, awaiting approval, overdue), and each list (next
 * unpublished, latest published, latest failed) its own ordered, limited read,
 * so neither depends on a capped window of rows.
 */
export async function calendarSummary(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  workItemId: string | null,
  options: { today: string; topN: number },
) {
  const scope = { db, ctx, client, workItemId };
  const { today, topN } = options;
  const statuses = Object.keys(GENERATION_LABELS);
  const [statusCounts, awaiting, overdue, upcoming, published, failed] =
    await Promise.all([
      Promise.all(
        statuses.map((s) => count(scope, (q) => q.eq("generation_status", s))),
      ),
      count(scope, (q) =>
        q
          .eq("approval_status", "pending")
          .neq("generation_status", "published"),
      ),
      count(scope, (q) =>
        q
          .lt("scheduled_date", today)
          .in("generation_status", NOT_YET_PUBLISHED),
      ),
      list(scope, (q) =>
        q
          .gte("scheduled_date", today)
          .in("generation_status", NOT_YET_PUBLISHED)
          .order("scheduled_date", { ascending: true })
          .limit(topN),
      ),
      list(scope, (q) =>
        q
          .eq("generation_status", "published")
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(topN),
      ),
      list(scope, (q) =>
        q
          .eq("generation_status", "failed")
          .order("scheduled_date", { ascending: false })
          .limit(topN),
      ),
    ]);
  const byStatus = Object.fromEntries(
    statuses.flatMap((s, i) =>
      statusCounts[i] ? [[GENERATION_LABELS[s], statusCounts[i]]] : [],
    ),
  );
  return {
    total: statusCounts.reduce((sum, n) => sum + n, 0),
    by_status: byStatus,
    awaiting_approval: awaiting,
    overdue,
    failed_total: statusCounts[statuses.indexOf("failed")],
    upcoming: upcoming.map((e) => ({
      date: e.scheduled_date,
      title: e.title,
      keyword: e.primary_keyword,
      status: GENERATION_LABELS[e.generation_status] ?? e.generation_status,
      approved: e.approval_status !== "pending",
    })),
    recently_published: published.map((e) => ({
      date: e.published_at ?? e.scheduled_date,
      title: e.title,
      keyword: e.primary_keyword,
      url: e.live_url,
    })),
    failed: failed.map((e) => ({
      date: e.scheduled_date,
      title: e.title,
      error: clip(e.publish_error, 200),
    })),
  };
}

/** The client's calendar entries (of the plan, when there is one), selected as asked. */
function entries(
  { db, ctx, client, workItemId }: Scope,
  columns: string,
  options?: { count: "exact"; head: true },
) {
  const query = db
    .from("seo_geo_calendar_entries")
    .select(columns, options)
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds);
  return workItemId ? query.eq("work_item_id", workItemId) : query;
}

type EntriesQuery = ReturnType<typeof entries>;

/** How many entries match. */
async function count(
  scope: Scope,
  narrow: (query: EntriesQuery) => EntriesQuery,
): Promise<number> {
  const { count: total, error } = await narrow(
    entries(scope, "id", { count: "exact", head: true }),
  );
  throwIfError("ספירת לוח התוכן", error);
  return total ?? 0;
}

/** The entries one list shows. */
async function list(
  scope: Scope,
  narrow: (query: EntriesQuery) => EntriesQuery,
) {
  const { data, error } = await narrow(
    entries(
      scope,
      "scheduled_date, title, primary_keyword, approval_status, generation_status, live_url, published_at, publish_error",
    ),
  );
  throwIfError("לוח התוכן", error);
  return (data ?? []) as Array<CalendarEntry>;
}

/** The calendar columns the lists show. */
type CalendarEntry = {
  scheduled_date: string;
  title: string;
  primary_keyword: string | null;
  approval_status: string;
  generation_status: string;
  live_url: string | null;
  published_at: string | null;
  publish_error: string | null;
};
