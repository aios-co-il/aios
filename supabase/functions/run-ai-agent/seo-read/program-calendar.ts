import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { throwIfError } from "./context.ts";
import { clip, countBy } from "./numbers.ts";

const GENERATION_LABELS: Record<string, string> = {
  planned: "מתוכנן",
  generating: "בכתיבה",
  draft: "טיוטה",
  published: "פורסם",
  failed: "נכשל",
};

/**
 * The content calendar: counts per generation and approval status, the next
 * unpublished entries, the latest published ones and failed publishes.
 */
export async function calendarSummary(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  workItemId: string | null,
  options: { today: string; topN: number },
) {
  let query = db
    .from("seo_geo_calendar_entries")
    .select(
      "scheduled_date, title, primary_keyword, content_type, approval_status, generation_status, live_url, published_at, publish_error",
    )
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds);
  if (workItemId) {
    query = query.eq("work_item_id", workItemId);
  }
  const { data, error } = await query
    .order("scheduled_date", { ascending: true })
    .limit(500);
  throwIfError("לוח התוכן", error);
  const entries = data ?? [];
  const unpublished = entries.filter(
    (e) => e.generation_status !== "published",
  );
  const published = entries
    .filter((e) => e.generation_status === "published")
    .sort((a, b) =>
      String(b.published_at ?? b.scheduled_date).localeCompare(
        String(a.published_at ?? a.scheduled_date),
      ),
    );
  const { topN, today } = options;
  return {
    total: entries.length,
    by_status: countBy(
      entries,
      (e) => GENERATION_LABELS[e.generation_status] ?? e.generation_status,
    ),
    awaiting_approval: entries.filter(
      (e) =>
        e.approval_status === "pending" && e.generation_status !== "published",
    ).length,
    overdue: unpublished.filter(
      (e) => e.scheduled_date < today && e.generation_status !== "failed",
    ).length,
    upcoming: unpublished
      .filter((e) => e.scheduled_date >= today)
      .slice(0, topN)
      .map((e) => ({
        date: e.scheduled_date,
        title: e.title,
        keyword: e.primary_keyword,
        status: GENERATION_LABELS[e.generation_status] ?? e.generation_status,
        approved: e.approval_status !== "pending",
      })),
    recently_published: published.slice(0, topN).map((e) => ({
      date: e.published_at ?? e.scheduled_date,
      title: e.title,
      keyword: e.primary_keyword,
      url: e.live_url,
    })),
    failed: entries
      .filter((e) => e.generation_status === "failed")
      .slice(0, topN)
      .map((e) => ({
        date: e.scheduled_date,
        title: e.title,
        error: clip(e.publish_error, 200),
      })),
  };
}
