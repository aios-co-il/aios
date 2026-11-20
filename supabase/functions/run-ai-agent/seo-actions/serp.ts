import type { SeoClient, SeoDb, SeoRefusal } from "../seo-read/context.ts";
import { throwIfError } from "../seo-read/context.ts";
import type { SeoAction, SeoActionContext, SeoActionPlan } from "./context.ts";

// The markets serpapi-search maps to a Google location, and their language.
const COUNTRY_LANGUAGE: Record<string, string> = {
  il: "he",
  us: "en",
  uk: "en",
  au: "en",
  ca: "en",
  de: "de",
  fr: "fr",
  es: "es",
  it: "it",
  nl: "nl",
};
const MAX_KEYWORDS = 10;
const PROVIDERS = ["dataforseo", "serpapi"];

/**
 * check_serp_rankings: where the client's site ranks in Google for up to 10
 * phrases, and who ranks above it, via serpapi-search on the caller's tenant's
 * search provider (one paid search per phrase).
 */
export const serpRankings: SeoAction = {
  async prepare(db, ctx, client, args) {
    const input = parseSerpInput(args);
    if ("error" in input) {
      return input;
    }
    if (!client.domain) {
      return {
        error: "no_domain",
        message: `בכרטיס של ${client.name} אין אתר, ולכן אין מה לחפש בגוגל. מוסיפים אתר בכרטיס הלקוח.`,
      };
    }
    const provider = await searchProvider(db, ctx);
    if (!provider) {
      return {
        error: "not_connected",
        message:
          "אין ספק חיפוש מחובר בארגון (DataForSEO או SerpAPI). מחברים במסך האינטגרציות.",
      };
    }
    return planFor(client, input, provider);
  },
  async run(_db, ctx, client, plan) {
    const keywords = plan.input.keywords as Array<string>;
    const results = [];
    for (const keyword of keywords) {
      results.push(await searchOne(ctx, client, plan, keyword));
    }
    const failed = results.filter((r) => "error" in r);
    if (failed.length === results.length) {
      return {
        error: "search_failed",
        message: `כל החיפושים נכשלו: ${String(failed[0]?.error)}`,
        results,
      };
    }
    return {
      success: true,
      client: { id: client.id, name: client.name, domain: client.domain },
      results,
      failed: failed.length,
    };
  },
};

/** Validated phrases (1–10, unique), market and device, or a refusal. */
function parseSerpInput(
  args: Record<string, unknown>,
): { keywords: Array<string>; country: string; device: string } | SeoRefusal {
  const raw = Array.isArray(args.keywords) ? args.keywords : [];
  const keywords = [
    ...new Set(
      raw
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 100),
    ),
  ];
  const country = String(args.country ?? "il").toLowerCase();
  const device = String(args.device ?? "desktop");
  if (
    !keywords.length ||
    keywords.length > MAX_KEYWORDS ||
    keywords.length !== raw.length
  ) {
    console.warn("[seo-actions] rejected keywords:", args.keywords);
    return {
      error: "invalid_args",
      message: `keywords: בין 1 ל-${MAX_KEYWORDS} ביטויים שונים, כל אחד עד 100 תווים.`,
    };
  }
  if (
    !(country in COUNTRY_LANGUAGE) ||
    !["desktop", "mobile"].includes(device)
  ) {
    console.warn("[seo-actions] rejected market:", args.country, args.device);
    return {
      error: "invalid_args",
      message: `country אחד מ-${Object.keys(COUNTRY_LANGUAGE).join(", ")}; device הוא desktop או mobile.`,
    };
  }
  return { keywords, country, device };
}

/** The tenant's active search provider (DataForSEO first, as serpapi-search picks). */
async function searchProvider(db: SeoDb, ctx: SeoActionContext) {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("integration_type")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .in("integration_type", PROVIDERS);
  throwIfError("ספקי חיפוש", error);
  const types = (data ?? []).map((row) => row.integration_type);
  return PROVIDERS.find((p) => types.includes(p)) ?? null;
}

/** The approval plan: phrases, market and one paid search each. */
function planFor(
  client: SeoClient,
  input: { keywords: Array<string>; country: string; device: string },
  provider: string,
): SeoActionPlan {
  const name = provider === "serpapi" ? "SerpAPI" : "DataForSEO";
  return {
    title: `בדיקת מיקומים בגוגל ל${client.name} (${input.keywords.length} ביטויים)`,
    summary: `חיפוש ב-Google ${input.country.toUpperCase()} (${input.device}) של: ${input.keywords.join(", ")} — איפה ${client.domain} מופיע ומי מעליו.`,
    cost: {
      payer: `חשבון ${name} של הארגון`,
      calls: input.keywords.length,
      note: `חיפוש בתשלום אחד לכל ביטוי (${name}).`,
    },
    input: { client_id: client.id, ...input },
  };
}

/** One phrase through serpapi-search, as a result row or its error. */
async function searchOne(
  ctx: SeoActionContext,
  client: SeoClient,
  plan: SeoActionPlan,
  keyword: string,
) {
  const country = String(plan.input.country);
  const reply = await ctx.invoke("serpapi-search", {
    action: "search",
    tenant_id: ctx.tenantId,
    keyword,
    domain: client.domain,
    country,
    language: COUNTRY_LANGUAGE[country],
    device: plan.input.device,
  });
  if (!reply.ok || reply.json.success !== true) {
    console.error(
      "[seo-actions] serpapi-search failed:",
      keyword,
      reply.status,
      reply.json,
    );
    return { keyword, error: String(reply.json.error ?? reply.status) };
  }
  const competitors = Array.isArray(reply.json.competitors)
    ? reply.json.competitors
    : [];
  return {
    keyword,
    position: reply.json.position ?? null,
    found_url: reply.json.found_url ?? null,
    serp_features: reply.json.serp_features ?? [],
    top_results: competitors.slice(0, 5),
  };
}
