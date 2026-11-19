import { normalizeSeoDomain } from "../../_shared/seo-sync.ts";
import type { SeoClient, SeoDb } from "./context.ts";
import { throwIfError } from "./context.ts";
import { round } from "./numbers.ts";
import { readAllPages } from "./pages.ts";

type ScanRow = {
  prompt_id: string;
  platform: string;
  is_mentioned: boolean;
  citations: Array<string> | null;
};

/**
 * The newest scan of a brand: mention rate per platform, the prompts where it
 * was not mentioned, the most cited sources and competitors' mention rates.
 * The newest scan is found first, then all of its rows are read (paged);
 * `partial` says when the page cap cut them.
 */
export async function latestScan(
  db: SeoDb,
  client: SeoClient,
  brandId: string,
  topN: number,
) {
  const { data: newest, error } = await db
    .from("ai_detection_results")
    .select("scanned_at, scan_id")
    .eq("brand_id", brandId)
    .eq("tenant_id", client.tenantId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError("סריקת AI אחרונה", error);
  if (!newest) {
    return null;
  }
  const scan = await scanRows(db, client, brandId, newest);
  const competitors = newest.scan_id
    ? await competitorRates(db, client, brandId, newest.scan_id)
    : { rates: [], partial: false };
  const missedIds = [
    ...new Set(
      scan.rows.filter((r) => !r.is_mentioned).map((r) => r.prompt_id),
    ),
  ];
  return {
    scanned_at: newest.scanned_at,
    answers: scan.rows.length,
    mention_rate_pct_by_platform: mentionRates(scan.rows),
    missed_prompts: await promptTexts(db, client, missedIds.slice(0, topN)),
    missed_prompts_total: missedIds.length,
    top_cited_sources: topCitations(scan.rows, topN),
    competitors: competitors.rates,
    partial: scan.partial || competitors.partial,
  };
}

/** Every answer of the scan: by scan_id, or the scan's UTC day for older scans without one. */
function scanRows(
  db: SeoDb,
  client: SeoClient,
  brandId: string,
  newest: { scanned_at: string; scan_id: string | null },
) {
  const day = String(newest.scanned_at).slice(0, 10);
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return readAllPages<ScanRow>("תוצאות סריקת AI", (from, to) => {
    let query = db
      .from("ai_detection_results")
      .select("id, prompt_id, platform, is_mentioned, citations")
      .eq("brand_id", brandId)
      .eq("tenant_id", client.tenantId);
    query = newest.scan_id
      ? query.eq("scan_id", newest.scan_id)
      : query
          .gte("scanned_at", `${day}T00:00:00Z`)
          .lt("scanned_at", next.toISOString());
    return query.order("id", { ascending: true }).range(from, to);
  });
}

/** Percent of answers mentioning the brand, per platform. */
function mentionRates(
  rows: Array<{ platform: string; is_mentioned: boolean }>,
) {
  const rates: Record<string, number> = {};
  for (const platform of new Set(rows.map((r) => r.platform))) {
    const answers = rows.filter((r) => r.platform === platform);
    rates[platform] = round(
      (answers.filter((r) => r.is_mentioned).length / answers.length) * 100,
      0,
    );
  }
  return rates;
}

/** The hosts AI answers cite most. */
function topCitations(
  rows: Array<{ citations: Array<string> | null }>,
  topN: number,
) {
  const counts = new Map<string, number>();
  for (const url of rows.flatMap((r) => r.citations ?? [])) {
    const host = normalizeSeoDomain(url);
    if (host) {
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([domain, citations]) => ({ domain, citations }));
}

/** The text of prompts by id, in the client's tenant. */
async function promptTexts(db: SeoDb, client: SeoClient, ids: Array<string>) {
  if (!ids.length) {
    return [];
  }
  const { data, error } = await db
    .from("ai_detection_prompts")
    .select("id, prompt, category")
    .in("id", ids)
    .eq("tenant_id", client.tenantId);
  throwIfError("שאלות סריקת AI", error);
  return (data ?? []).map((p) => ({ prompt: p.prompt, category: p.category }));
}

/** Each tracked competitor's mention rate in the same scan (all rows, paged). */
async function competitorRates(
  db: SeoDb,
  client: SeoClient,
  brandId: string,
  scanId: string,
) {
  const { rows, partial } = await readAllPages<{
    competitor_name: string;
    is_mentioned: boolean;
  }>("תוצאות מתחרים בסריקת AI", (from, to) =>
    db
      .from("ai_detection_competitor_results")
      .select("id, competitor_name, is_mentioned")
      .eq("brand_id", brandId)
      .eq("scan_id", scanId)
      .eq("tenant_id", client.tenantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const rates = [...new Set(rows.map((r) => r.competitor_name))].map((name) => {
    const answers = rows.filter((r) => r.competitor_name === name);
    return {
      competitor: name,
      mention_rate_pct: round(
        (answers.filter((r) => r.is_mentioned).length / answers.length) * 100,
        0,
      ),
    };
  });
  return { rates, partial };
}
