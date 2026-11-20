import type {
  SeoClient,
  SeoDb,
  SeoToolContext,
  SeoUnavailable,
} from "./context.ts";
import { throwIfError } from "./context.ts";
import { seoDomainsMatch } from "./client.ts";

/** How many of the client's newest reports are scanned for one on its site. */
export const AHREFS_CANDIDATES = 200;

/**
 * The newest stored Ahrefs report that has snapshot metrics and is for the
 * client's own site. Candidates are read light (domain and four snapshot
 * numbers, not the keyword lists), so a run of rank-tracker or other-domain
 * rows cannot push the real snapshot out of the window; then only the chosen
 * row is read in full. Without a domain on the client card nothing can be
 * verified, so no report is presented as the client's.
 */
export async function pickAhrefsReport(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
) {
  const { data, error } = await db
    .from("ahrefs_reports")
    .select(
      "id, domain, report_date, dr:report_data->snapshot->dr, traffic:report_data->snapshot->org_traffic, keywords:report_data->snapshot->org_keywords_total, refdomains:report_data->snapshot->referring_domains",
    )
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("received_at", { ascending: false })
    .limit(AHREFS_CANDIDATES);
  throwIfError("דוחות Ahrefs", error);
  const rows = data ?? [];
  const withMetrics = rows.filter((row) =>
    [row.dr, row.traffic, row.keywords, row.refdomains].some(
      (value) => typeof value === "number",
    ),
  );
  const unavailable = whyUnavailable(client, rows.length, withMetrics);
  if (unavailable) {
    return unavailable;
  }
  // A report for another site must never be quoted as this client's numbers.
  const match = withMetrics.find((r) =>
    seoDomainsMatch(r.domain, client.domain),
  );
  if (!match) {
    const scanned =
      rows.length >= AHREFS_CANDIDATES
        ? ` (נבדקו ${AHREFS_CANDIDATES} הדוחות האחרונים)`
        : "";
    return {
      status: "domain_mismatch",
      message: `הדוחות השמורים הם לדומיין ${withMetrics[0].domain} ולא לדומיין של הלקוח (${client.domain})${scanned}. לא מציגה נתונים של אתר אחר.`,
    } satisfies SeoUnavailable;
  }
  const { data: report, error: reportError } = await db
    .from("ahrefs_reports")
    .select(
      "id, domain, report_type, report_date, received_at, report_data, comparison_data",
    )
    .eq("id", match.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .maybeSingle();
  throwIfError("דוח Ahrefs", reportError);
  if (!report) {
    throw new Error("דוח Ahrefs שנבחר לא נמצא בקריאה המלאה");
  }
  return report;
}

/** No report with metrics, or no client domain to check one against. */
function whyUnavailable(
  client: SeoClient,
  stored: number,
  withMetrics: Array<unknown>,
): SeoUnavailable | null {
  if (!withMetrics.length) {
    return {
      status: "no_data",
      message: stored
        ? `לדוחות ה-Ahrefs השמורים של ${client.name} אין נתוני snapshot (DR, תנועה). מסנכרנים מדוח ה-SEO של הלקוח (סנכרון צורך יחידות Ahrefs).`
        : `אין תמונת Ahrefs שמורה ל${client.name}. מסנכרנים מדוח ה-SEO של הלקוח (סנכרון צורך יחידות Ahrefs).`,
    };
  }
  if (!client.domain) {
    return {
      status: "no_domain",
      message: `בכרטיס של ${client.name} אין אתר או דומיין Ahrefs, ולכן אי אפשר לוודא שהדוח השמור הוא של האתר שלו. מוסיפים אתר בכרטיס הלקוח.`,
    };
  }
  return null;
}
