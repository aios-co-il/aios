import type { SeoClient, SeoDb, SeoRefusal } from "../seo-read/context.ts";
import { nowOf, throwIfError } from "../seo-read/context.ts";
import { trackedBrand } from "../seo-read/ai-visibility.ts";
import type { SeoAction, SeoActionContext, SeoActionPlan } from "./context.ts";

// ai-detection-scan asks 3 simulated platforms per prompt, plus one analysis
// call per answer that mentions the brand.
const ANSWERS_PER_PROMPT = 3;
const RECENT_SCAN_MS = 60 * 60 * 1000;

/**
 * run_ai_visibility_scan: one ai-detection-scan run of the brand that tracks
 * the client (the read tool's match), on AIOS's OpenAI key. Refused when no
 * brand or no active prompt exists, or a scan ran in the last hour.
 */
export const aiVisibilityScan: SeoAction = {
  async prepare(db, ctx, client) {
    const brand = await trackedBrand(db, client);
    if (!brand) {
      return {
        error: "not_connected",
        message: `${client.name} לא במעקב נראות ב-AI (אין מותג תואם בשם או בדומיין). מוסיפים מותג ושאלות במסך זיהוי AI לפני סריקה.`,
      };
    }
    const prompts = await activePrompts(db, client, brand.id);
    if (!prompts) {
      return {
        error: "no_prompts",
        message: `למותג ${brand.brand_name} אין שאלות פעילות לסריקה. מוסיפים שאלות במסך זיהוי AI.`,
      };
    }
    const recent = await recentScan(db, ctx, client, brand.id);
    if (recent) {
      return recent;
    }
    return planFor(client, brand, prompts);
  },
  async run(db, ctx, client, plan) {
    const brandId = String(plan.input.brand_id);
    const reply = await ctx.invoke("ai-detection-scan", {
      brand_id: brandId,
      tenant_id: client.tenantId,
    });
    if (!reply.ok || reply.json.success !== true) {
      console.error(
        "[seo-actions] ai-detection-scan failed:",
        reply.status,
        reply.json,
      );
      return {
        error: "scan_failed",
        message: `סריקת הנראות ב-AI נכשלה: ${String(reply.json.error ?? reply.status)}`,
      };
    }
    return {
      success: true,
      client: { id: client.id, name: client.name },
      score: reply.json.score ?? null,
      answers_scanned: reply.json.scanned ?? null,
      answers_mentioning: reply.json.mentioned ?? null,
      platforms: reply.json.platforms ?? null,
      message: "הסריקה הסתיימה. הציון והתוצאות זמינים ב-get_ai_visibility.",
    };
  },
};

/** How many active prompts the brand has. */
async function activePrompts(db: SeoDb, client: SeoClient, brandId: string) {
  const { count, error } = await db
    .from("ai_detection_prompts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("tenant_id", client.tenantId)
    .eq("is_active", true);
  throwIfError("שאלות סריקת AI", error);
  return count ?? 0;
}

/** A refusal when the brand was scanned in the last hour (no double spend). */
async function recentScan(
  db: SeoDb,
  ctx: SeoActionContext,
  client: SeoClient,
  brandId: string,
): Promise<SeoRefusal | null> {
  const since = new Date(nowOf(ctx).getTime() - RECENT_SCAN_MS).toISOString();
  const { data, error } = await db
    .from("ai_detection_results")
    .select("scanned_at")
    .eq("brand_id", brandId)
    .eq("tenant_id", client.tenantId)
    .gte("scanned_at", since)
    .limit(1)
    .maybeSingle();
  throwIfError("סריקות AI אחרונות", error);
  return data
    ? {
        error: "scan_too_recent",
        message: `המותג נסרק לפני פחות משעה (${data.scanned_at}). התוצאות ב-get_ai_visibility.`,
      }
    : null;
}

/** The approval plan: brand, prompt count and the call range. */
function planFor(
  client: SeoClient,
  brand: { id: string; brand_name: string },
  prompts: number,
): SeoActionPlan {
  const answers = prompts * ANSWERS_PER_PROMPT;
  return {
    title: `סריקת נראות ב-AI ל${client.name}`,
    summary: `סריקה של ${prompts} שאלות למותג ${brand.brand_name} (${answers} תשובות AI).`,
    cost: {
      payer: "מפתח OpenAI של AIOS",
      calls: { min: answers, max: answers * 2 },
      note: "gpt-4o-mini: תשובה לכל שאלה בכל פלטפורמה מדומה, ועוד ניתוח לכל תשובה שמזכירה את המותג.",
    },
    input: { client_id: client.id, brand_id: brand.id },
  };
}
