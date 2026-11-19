import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { clientRef } from "./context.ts";
import { ahrefsSnapshot } from "./ahrefs.ts";
import { aiVisibility } from "./ai-visibility.ts";
import { seoProgram } from "./program.ts";
import { searchConsolePerformance } from "./search-console.ts";
import { seoSignals } from "./signals.ts";

/**
 * get_seo_overview: one answer to "how is client X doing in SEO": the headline
 * of each source (Search Console, Ahrefs, SEO program, AI visibility) and
 * signals of what needs attention. A source that fails is reported as an error
 * in its section, so the others still answer.
 */
export async function seoOverview(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  topN: number,
) {
  const [gsc, ahrefs, program, ai] = await Promise.all([
    section("search_console", () =>
      searchConsolePerformance(db, ctx, client, topN),
    ),
    section("ahrefs", () => ahrefsSnapshot(db, ctx, client, topN)),
    section("program", () => seoProgram(db, ctx, client, topN)),
    section("ai_visibility", () => aiVisibility(db, ctx, client, topN)),
  ]);
  return {
    client: clientRef(client),
    search_console: pick(gsc, [
      "status",
      "message",
      "site_url",
      "synced_at",
      "stale",
      "periods",
      "clicks_per_day_change_pct",
      "striking_distance",
    ]),
    ahrefs: pick(ahrefs, [
      "status",
      "message",
      "domain",
      "report_date",
      "metrics",
      "change_vs_3_months_pct",
    ]),
    program: pick(program, [
      "status",
      "message",
      "program",
      "keywords",
      "calendar",
      "monthly_updates",
    ]),
    ai_visibility: pick(ai, [
      "status",
      "message",
      "brand",
      "latest_week",
      "score_change",
    ]),
    signals: seoSignals({ gsc, ahrefs, program, ai }),
    details_tools:
      "לפירוט: get_search_console_performance, get_ahrefs_snapshot, get_seo_program, get_ai_visibility",
  };
}

/** A source's answer, or its error recorded as the section's status. */
async function section(
  label: string,
  read: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  try {
    return await read();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[seo-read] overview ${label} failed:`, message);
    return { status: "error", message };
  }
}

/** The listed keys of a section that it has. */
function pick(source: Record<string, unknown>, keys: Array<string>) {
  return Object.fromEntries(
    keys.filter((k) => k in source).map((k) => [k, source[k]]),
  );
}
