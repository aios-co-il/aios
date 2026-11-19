import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { clientRef, throwIfError } from "./context.ts";
import { seoDomainsMatch } from "./client.ts";
import {
  topOrganicKeywords,
  topPages,
  trackedSummary,
} from "./ahrefs-keywords.ts";
import { numberOrNull, pctChange } from "./numbers.ts";

type Json = Record<string, unknown>;

/**
 * get_ahrefs_snapshot: the client's latest stored Ahrefs report (written by
 * fetch-ahrefs-snapshot / the Ahrefs webhook): DR, organic traffic and
 * keywords, backlinks and referring domains against 3 and 12 months ago, top
 * keywords, top pages by traffic and tracked keywords. No live Ahrefs call.
 */
export async function ahrefsSnapshot(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  topN: number,
) {
  const { data, error } = await db
    .from("ahrefs_reports")
    .select(
      "domain, report_type, report_date, received_at, report_data, comparison_data",
    )
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("report_date", { ascending: false, nullsFirst: false })
    .limit(5);
  throwIfError("דוחות Ahrefs", error);
  const reports = data ?? [];
  if (!reports.length) {
    return {
      client: clientRef(client),
      connected: false,
      status: "no_data",
      message: `אין תמונת Ahrefs שמורה ל${client.name}. מסנכרנים מדוח ה-SEO של הלקוח (סנכרון צורך יחידות Ahrefs).`,
    };
  }
  // A report for another site must never be quoted as this client's numbers.
  const report = client.domain
    ? reports.find((r) => seoDomainsMatch(r.domain, client.domain))
    : reports[0];
  if (!report) {
    return {
      client: clientRef(client),
      connected: false,
      status: "domain_mismatch",
      message: `הדוח השמור הוא לדומיין ${reports[0].domain} ולא לדומיין של הלקוח (${client.domain}). לא מציגה נתונים של אתר אחר.`,
    };
  }
  const reportData = asJson(report.report_data);
  const metrics = snapshotMetrics(asJson(reportData.snapshot));
  const history = asJson(report.comparison_data);
  const ago3 = historyMetrics(history["3_months"]);
  const ago12 = historyMetrics(history["12_months"]);
  const organic = Array.isArray(reportData.organic_keywords)
    ? reportData.organic_keywords
    : [];
  const tracked = Array.isArray(reportData.tracked_keywords)
    ? reportData.tracked_keywords
    : [];
  return {
    client: clientRef(client),
    connected: true,
    status: "ok",
    source: "Ahrefs (תמונה שמורה)",
    domain: report.domain,
    domain_verified: !!client.domain,
    report_date: report.report_date,
    received_at: report.received_at,
    metrics,
    three_months_ago: ago3,
    twelve_months_ago: ago12,
    change_vs_3_months_pct: changes(metrics, ago3),
    change_vs_12_months_pct: changes(metrics, ago12),
    top_keywords: topOrganicKeywords(organic, topN),
    top_pages: topPages(organic, topN),
    tracked_keywords: trackedSummary(tracked, topN),
    note: "בקלינקים ודומיינים מפנים — סיכומים בלבד; רשימות מלאות אינן נשמרות. העמודים המובילים מחושבים מ-500 מילות המפתח האורגניות השמורות.",
  };
}

/** The headline numbers of a stored snapshot. */
function snapshotMetrics(snapshot: Json) {
  return {
    domain_rating: numberOrNull(snapshot.dr),
    organic_traffic: numberOrNull(snapshot.org_traffic),
    organic_keywords: numberOrNull(snapshot.org_keywords_total),
    keywords_top3: numberOrNull(snapshot.org_keywords_top3),
    keywords_top10: numberOrNull(snapshot.org_keywords_top10),
    backlinks: numberOrNull(snapshot.backlinks_live),
    referring_domains: numberOrNull(snapshot.referring_domains),
  };
}

/** One historical point of comparison_data, or null when it was not fetched. */
function historyMetrics(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const point = value as Json;
  return {
    date: typeof point.date === "string" ? point.date : null,
    domain_rating: numberOrNull(point.dr),
    organic_traffic: numberOrNull(point.org_traffic),
    organic_keywords: numberOrNull(point.org_keywords_total),
    backlinks: numberOrNull(point.backlinks_live),
    referring_domains: numberOrNull(point.referring_domains),
  };
}

/** Percent changes of the shared metrics against a historical point. */
function changes(
  now: ReturnType<typeof snapshotMetrics>,
  then: ReturnType<typeof historyMetrics>,
) {
  if (!then) {
    return null;
  }
  return {
    domain_rating: pctChange(now.domain_rating, then.domain_rating),
    organic_traffic: pctChange(now.organic_traffic, then.organic_traffic),
    organic_keywords: pctChange(now.organic_keywords, then.organic_keywords),
    referring_domains: pctChange(now.referring_domains, then.referring_domains),
  };
}

/** A stored JSON object, or an empty one. */
function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}
