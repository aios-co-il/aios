import type { SeoClient, SeoDb, SeoRefusal } from "../seo-read/context.ts";
import { throwIfError } from "../seo-read/context.ts";
import type { SeoAction, SeoActionContext } from "./context.ts";
import { NO_COST } from "./context.ts";

const PRIORITIES = ["high", "medium", "low"];
const MAX_KEYWORDS = 50;

/** One phrase to add or update; intent and priority only change when given. */
type KeywordInput = { keyword: string; intent?: string; priority?: string };

/** The program a keyword list belongs to. */
type Program = { work_item_id: string; tenant_id: string };

/**
 * upsert_seo_keywords: adds phrases to the client's SEO / GEO program
 * (seo_geo_keywords, source "carmen") and updates the intent or priority of
 * phrases already in it. Free, but it changes the plan, so it is approved first.
 */
export const upsertKeywords: SeoAction = {
  async prepare(db, ctx, client, args) {
    const keywords = parseKeywords(args);
    if ("error" in keywords) {
      return keywords;
    }
    const program = await latestProgram(db, ctx, client);
    if (!program) {
      return {
        error: "no_program",
        message: `ל${client.name} אין תוכנית SEO / GEO. פותחים תוכנית במחלקת ה-SEO במסך השיווק, ואז מוסיפים ביטויים.`,
      };
    }
    const existing = await existingKeywords(db, program);
    const added = keywords.filter(
      (k) => !existing.has(k.keyword.toLowerCase()),
    );
    return {
      title: `עדכון ביטויי SEO ל${client.name} (${keywords.length})`,
      summary: `הוספה: ${added.map((k) => k.keyword).join(", ") || "אין"}. עדכון: ${keywords.length - added.length} ביטויים קיימים.`,
      cost: NO_COST,
      input: { client_id: client.id, keywords },
    };
  },
  async run(db, ctx, client, plan) {
    const program = await latestProgram(db, ctx, client);
    if (!program) {
      return {
        error: "no_program",
        message: "תוכנית ה-SEO של הלקוח לא נמצאה.",
      };
    }
    const keywords = plan.input.keywords as Array<KeywordInput>;
    const existing = await existingKeywords(db, program);
    const added = keywords.filter(
      (k) => !existing.has(k.keyword.toLowerCase()),
    );
    await insertKeywords(db, client, program, added, existing.size);
    let updated = 0;
    for (const k of keywords) {
      const row = existing.get(k.keyword.toLowerCase());
      if (row && (k.intent || k.priority)) {
        await updateKeyword(db, program, row.id, k);
        updated += 1;
      }
    }
    return {
      success: true,
      client: { id: client.id, name: client.name },
      added: added.map((k) => k.keyword),
      updated,
    };
  },
};

/** Validated phrases (1–50, unique, case-insensitively), or a refusal. */
function parseKeywords(
  args: Record<string, unknown>,
): Array<KeywordInput> | SeoRefusal {
  const raw = Array.isArray(args.keywords) ? args.keywords : [];
  const seen = new Set<string>();
  const parsed: Array<KeywordInput> = [];
  for (const item of raw) {
    const k: Record<string, unknown> =
      typeof item === "string"
        ? { keyword: item }
        : item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
    const keyword = typeof k.keyword === "string" ? k.keyword.trim() : "";
    const intent = typeof k.intent === "string" ? k.intent.trim() : "";
    const priority = typeof k.priority === "string" ? k.priority : "";
    const key = keyword.toLowerCase();
    if (
      !keyword ||
      keyword.length > 120 ||
      seen.has(key) ||
      intent.length > 40 ||
      (priority && !PRIORITIES.includes(priority))
    ) {
      console.warn("[seo-actions] rejected keyword:", item);
      return {
        error: "invalid_args",
        message: `keywords: 1–${MAX_KEYWORDS} ביטויים שונים (עד 120 תווים), intent עד 40 תווים, priority אחד מ-${PRIORITIES.join("/")}.`,
      };
    }
    seen.add(key);
    parsed.push({
      keyword,
      ...(intent ? { intent } : {}),
      ...(priority ? { priority } : {}),
    });
  }
  if (!parsed.length || parsed.length > MAX_KEYWORDS) {
    return {
      error: "invalid_args",
      message: `keywords: בין 1 ל-${MAX_KEYWORDS} ביטויים.`,
    };
  }
  return parsed;
}

/** The client's most recently updated program, if any. */
async function latestProgram(
  db: SeoDb,
  ctx: SeoActionContext,
  client: SeoClient,
): Promise<Program | null> {
  const { data, error } = await db
    .from("seo_geo_programs")
    .select("work_item_id, tenant_id")
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError("תוכנית ה-SEO", error);
  return data;
}

/** The program's phrases by lower-cased text. */
async function existingKeywords(db: SeoDb, program: Program) {
  const { data, error } = await db
    .from("seo_geo_keywords")
    .select("id, keyword")
    .eq("work_item_id", program.work_item_id)
    .eq("tenant_id", program.tenant_id)
    .limit(2000);
  throwIfError("ביטויי התוכנית", error);
  return new Map((data ?? []).map((row) => [row.keyword.toLowerCase(), row]));
}

/** Adds new phrases after the existing ones; a phrase added meanwhile is kept as is. */
async function insertKeywords(
  db: SeoDb,
  client: SeoClient,
  program: Program,
  added: Array<KeywordInput>,
  offset: number,
) {
  if (!added.length) {
    return;
  }
  const { error } = await db.from("seo_geo_keywords").upsert(
    added.map((k, i) => ({
      tenant_id: program.tenant_id,
      client_id: client.id,
      work_item_id: program.work_item_id,
      keyword: k.keyword,
      intent: k.intent ?? null,
      priority: k.priority ?? "medium",
      source: "carmen",
      promoted: true,
      sort_order: offset + i,
    })),
    { onConflict: "work_item_id,keyword", ignoreDuplicates: true },
  );
  throwIfError("הוספת ביטויים", error);
}

/** Sets the given intent / priority of an existing phrase. */
async function updateKeyword(
  db: SeoDb,
  program: Program,
  id: string,
  k: KeywordInput,
) {
  const { error } = await db
    .from("seo_geo_keywords")
    .update({
      ...(k.intent ? { intent: k.intent } : {}),
      ...(k.priority ? { priority: k.priority } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", program.tenant_id);
  throwIfError("עדכון ביטוי", error);
}
