import { normalizeSeoDomain } from "../../_shared/seo-sync.ts";
import type { SeoClient, SeoDb } from "./context.ts";
import { throwIfError } from "./context.ts";
import { round } from "./numbers.ts";

const RESULT_ROWS = 300;

/**
 * The newest scan of a brand: mention rate per platform, the prompts where it
 * was not mentioned, the most cited sources and competitors' mention rates.
 */
export async function latestScan(
  db: SeoDb,
  client: SeoClient,
  brandId: string,
  topN: number,
) {
  const { data, error } = await db
    .from("ai_detection_results")
    .select("prompt_id, platform, is_mentioned, citations, scanned_at, scan_id")
    .eq("brand_id", brandId)
    .eq("tenant_id", client.tenantId)
    .order("scanned_at", { ascending: false })
    .limit(RESULT_ROWS);
  throwIfError("תוצאות סריקת AI", error);
  const rows = data ?? [];
  if (!rows.length) {
    return null;
  }
  // Older scans had no scan_id: fall back to the newest scan's day.
  const newest = rows[0];
  const scan = rows.filter((r) =>
    newest.scan_id
      ? r.scan_id === newest.scan_id
      : String(r.scanned_at).slice(0, 10) ===
        String(newest.scanned_at).slice(0, 10),
  );
  const missedIds = [
    ...new Set(scan.filter((r) => !r.is_mentioned).map((r) => r.prompt_id)),
  ];
  return {
    scanned_at: newest.scanned_at,
    answers: scan.length,
    mention_rate_pct_by_platform: mentionRates(scan),
    missed_prompts: await promptTexts(db, client, missedIds.slice(0, topN)),
    missed_prompts_total: missedIds.length,
    top_cited_sources: topCitations(scan, topN),
    competitors: newest.scan_id
      ? await competitorRates(db, client, brandId, newest.scan_id)
      : [],
  };
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

/** Each tracked competitor's mention rate in the same scan. */
async function competitorRates(
  db: SeoDb,
  client: SeoClient,
  brandId: string,
  scanId: string,
) {
  const { data, error } = await db
    .from("ai_detection_competitor_results")
    .select("competitor_name, is_mentioned")
    .eq("brand_id", brandId)
    .eq("scan_id", scanId)
    .eq("tenant_id", client.tenantId)
    .limit(1000);
  throwIfError("תוצאות מתחרים בסריקת AI", error);
  const rows = data ?? [];
  return [...new Set(rows.map((r) => r.competitor_name))].map((name) => {
    const answers = rows.filter((r) => r.competitor_name === name);
    return {
      competitor: name,
      mention_rate_pct: round(
        (answers.filter((r) => r.is_mentioned).length / answers.length) * 100,
        0,
      ),
    };
  });
}
