import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { throwIfError } from "./context.ts";
import { clip } from "./numbers.ts";

/** Hebrew for seo_monthly_status. */
export const MONTHLY_STATUS_LABELS: Record<string, string> = {
  up: "עלייה",
  stable: "יציב",
  down: "ירידה",
};

const MONTHS_SHOWN = 3;

/**
 * The latest monthly SEO updates: trend status, notes, and the work log
 * (`work` = { summary, onsite[], articles[], links[] }) as counts and a summary.
 */
export async function monthlyUpdates(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
) {
  const { data, error } = await db
    .from("seo_monthly_updates")
    .select("month, status, notes, work")
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("month", { ascending: false })
    .limit(MONTHS_SHOWN);
  throwIfError("העדכונים החודשיים", error);
  return (data ?? []).map((row) => {
    const work =
      row.work && typeof row.work === "object" && !Array.isArray(row.work)
        ? (row.work as Record<string, unknown>)
        : {};
    return {
      month: row.month,
      status: row.status,
      status_label: MONTHLY_STATUS_LABELS[row.status] ?? row.status,
      notes: clip(row.notes, 400),
      work_summary: clip(work.summary, 400),
      onsite_items: listLength(work.onsite),
      articles: listLength(work.articles),
      links: listLength(work.links),
    };
  });
}

/** Length of a stored list, 0 when absent. */
function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
