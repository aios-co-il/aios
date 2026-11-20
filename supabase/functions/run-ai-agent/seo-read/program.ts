import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { clientRef, nowOf, throwIfError } from "./context.ts";
import { calendarSummary } from "./program-calendar.ts";
import { monthlyUpdates } from "./program-monthly.ts";
import { countBy } from "./numbers.ts";

/**
 * get_seo_program: the client's SEO / GEO program (marketing SEO department):
 * tracked keywords, the content calendar (planned, drafted, published, failed)
 * and the latest monthly work updates.
 */
export async function seoProgram(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  topN: number,
) {
  const program = await latestProgram(db, ctx, client);
  const [keywords, calendar, months] = await Promise.all([
    programKeywords(db, ctx, client, program?.work_item_id ?? null),
    calendarSummary(db, ctx, client, program?.work_item_id ?? null, {
      today: nowOf(ctx).toISOString().slice(0, 10),
      topN,
    }),
    monthlyUpdates(db, ctx, client),
  ]);
  if (!program && !keywords.length && !calendar.total && !months.length) {
    return {
      client: clientRef(client),
      status: "no_data",
      message: `ל${client.name} אין תוכנית SEO / GEO, לוח תוכן או עדכון חודשי. פותחים תוכנית במחלקת ה-SEO במסך השיווק.`,
    };
  }
  return {
    client: clientRef(client),
    status: "ok",
    source: "תוכנית SEO / GEO ועדכונים חודשיים",
    program: program
      ? {
          auto_approve: program.auto_approve,
          horizon_months: program.horizon_months,
          wordpress_connected: !!program.wordpress_site_id,
          created_at: program.created_at,
          updated_at: program.updated_at,
        }
      : null,
    keywords: {
      count: keywords.length,
      by_priority: countBy(keywords, (k) => k.priority || "ללא"),
      top: keywords.slice(0, topN).map((k) => ({
        keyword: k.keyword,
        intent: k.intent,
        priority: k.priority,
      })),
    },
    calendar,
    monthly_updates: months,
  };
}

/** The client's most recently updated program, if any. */
async function latestProgram(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
) {
  const { data, error } = await db
    .from("seo_geo_programs")
    .select(
      "work_item_id, auto_approve, horizon_months, wordpress_site_id, created_at, updated_at",
    )
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError("תוכנית ה-SEO", error);
  return data;
}

/** The program's promoted keywords in plan order (all of the client's without a program). */
async function programKeywords(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  workItemId: string | null,
) {
  let query = db
    .from("seo_geo_keywords")
    .select("keyword, intent, priority, sort_order")
    .eq("client_id", client.id)
    .eq("promoted", true)
    .in("tenant_id", ctx.accessibleTenantIds);
  if (workItemId) {
    query = query.eq("work_item_id", workItemId);
  }
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .limit(300);
  throwIfError("מילות המפתח של התוכנית", error);
  return data ?? [];
}
