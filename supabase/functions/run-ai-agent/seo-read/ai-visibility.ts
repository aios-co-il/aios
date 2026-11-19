import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { clientRef, throwIfError } from "./context.ts";
import { seoDomainsMatch } from "./client.ts";
import { latestScan } from "./ai-visibility-scan.ts";

const WEEKS_SHOWN = 8;

/**
 * get_ai_visibility (GEO): how often ChatGPT, Gemini and Perplexity mention the
 * client, from the AI-detection brand that tracks it: weekly scores, trend, and
 * the latest scan (missed prompts, cited sources, competitors). Reads only;
 * running a scan is ai-detection-scan's job.
 */
export async function aiVisibility(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  topN: number,
) {
  const brand = await trackedBrand(db, client);
  if (!brand) {
    return {
      client: clientRef(client),
      connected: false,
      status: "not_connected",
      message: `${client.name} לא במעקב נראות ב-AI (אין מותג תואם בשם או בדומיין). מוסיפים מותג במסך זיהוי AI.`,
    };
  }
  const { data: scores, error } = await db
    .from("ai_detection_scores")
    .select(
      "week_start, score, chatgpt_score, gemini_score, perplexity_score, total_prompts, mentioned_prompts",
    )
    .eq("brand_id", brand.id)
    .eq("tenant_id", client.tenantId)
    .order("week_start", { ascending: false })
    .limit(WEEKS_SHOWN);
  throwIfError("ציוני נראות ב-AI", error);
  const weeks = scores ?? [];
  const scan = await latestScan(db, client, brand.id, topN);
  if (!weeks.length && !scan) {
    return {
      client: clientRef(client),
      connected: true,
      status: "no_data",
      brand: brand.brand_name,
      message: `המותג ${brand.brand_name} במעקב, אבל עדיין לא נסרק.`,
    };
  }
  const [latest, previous] = weeks;
  return {
    client: clientRef(client),
    connected: true,
    status: "ok",
    source: "זיהוי AI (סריקות שמורות)",
    brand: brand.brand_name,
    competitors_tracked: brand.competitor_names ?? [],
    latest_week: latest
      ? {
          week_start: latest.week_start,
          score: latest.score,
          chatgpt: latest.chatgpt_score,
          gemini: latest.gemini_score,
          perplexity: latest.perplexity_score,
          mentioned_prompts: latest.mentioned_prompts,
          total_prompts: latest.total_prompts,
        }
      : null,
    score_change: latest && previous ? latest.score - previous.score : null,
    history: weeks.map((w) => ({ week_start: w.week_start, score: w.score })),
    latest_scan: scan,
    note: "ציון = אחוז השאלות שבהן המותג הוזכר. שינוי ציון בנקודות.",
  };
}

/**
 * The AI-detection brand of the client's tenant that tracks it: the same site
 * (brand url vs the client's domain) first, else the same name.
 */
async function trackedBrand(db: SeoDb, client: SeoClient) {
  const { data, error } = await db
    .from("ai_detection_brands")
    .select("id, brand_name, url, competitor_names")
    .eq("tenant_id", client.tenantId);
  throwIfError("מותגים במעקב AI", error);
  const brands = data ?? [];
  const name = normalizeName(client.name);
  return (
    brands.find(
      (b) => client.domain && seoDomainsMatch(b.url, client.domain),
    ) ??
    brands.find((b) => !!name && normalizeName(b.brand_name) === name) ??
    null
  );
}

/** Lower-case name with collapsed spaces, for an exact name match. */
function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
