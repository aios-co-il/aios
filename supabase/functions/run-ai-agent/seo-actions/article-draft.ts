import type { SeoClient, SeoDb, SeoRefusal } from "../seo-read/context.ts";
import { throwIfError } from "../seo-read/context.ts";
import type { SeoAction, SeoActionContext } from "./context.ts";
import { isRefusal } from "../seo-read/client.ts";
import {
  type CalendarEntry,
  isApprovedEntry,
  loadClientEntry,
  notApproved,
} from "./entries.ts";

/**
 * generate_seo_article_draft: marketing-seo-generate-entry writes the article
 * of an approved calendar entry on the tenant's own OpenAI key. An existing
 * draft is rewritten only with regenerate=true; a published entry never is.
 */
export const articleDraft: SeoAction = {
  async prepare(db, ctx, client, args) {
    const entry = await loadClientEntry(db, ctx, client, args);
    if (isRefusal(entry)) {
      return entry;
    }
    const regenerate = args.regenerate === true;
    const problem =
      draftProblem(entry, regenerate) ?? (await llmProblem(db, entry));
    if (problem) {
      return problem;
    }
    return {
      title: `${regenerate ? "כתיבה מחדש" : "כתיבת טיוטה"}: ${entry.title} (${client.name})`,
      summary: `כרמן תכתוב טיוטת מאמר לכתבה "${entry.title}" (ביטוי: ${entry.primary_keyword ?? "—"}). הטיוטה נשמרת בלוח התוכן ולא מתפרסמת.`,
      cost: {
        payer: "מפתח OpenAI של הארגון",
        calls: 1,
        note: "קריאת gpt-4o-mini אחת, עד 8,000 טוקנים בתשובה.",
      },
      input: { client_id: client.id, entry_id: entry.id, regenerate },
    };
  },
  async run(db, ctx, client, plan) {
    const entryId = String(plan.input.entry_id);
    const reply = await ctx.invoke("marketing-seo-generate-entry", {
      entry_id: entryId,
    });
    if (!reply.ok || reply.json.ok !== true) {
      console.error(
        "[seo-actions] generate-entry failed:",
        reply.status,
        reply.json,
      );
      await releaseGenerating(db, ctx, client, entryId);
      return {
        error: "generation_failed",
        message: `כתיבת הטיוטה נכשלה: ${String(reply.json.error ?? reply.status)}`,
      };
    }
    const entry = await loadClientEntry(db, ctx, client, { entry_id: entryId });
    return {
      success: true,
      entry_id: entryId,
      title: isRefusal(entry) ? null : (entry.title_draft ?? entry.title),
      message:
        "הטיוטה נשמרה בלוח התוכן. לפרסום — publish_seo_article (דורש אישור).",
    };
  },
};

/** Why the entry cannot be drafted now, or null. */
function draftProblem(
  entry: CalendarEntry,
  regenerate: boolean,
): SeoRefusal | null {
  if (!isApprovedEntry(entry)) {
    return notApproved(entry);
  }
  if (entry.generation_status === "published") {
    return {
      error: "already_published",
      message: `הכתבה כבר פורסמה: ${entry.live_url ?? ""}`.trim(),
    };
  }
  if (entry.generation_status === "generating") {
    return {
      error: "generation_in_progress",
      message: "הטיוטה של הכתבה הזו כבר בכתיבה.",
    };
  }
  if (entry.generation_status === "draft" && entry.has_content && !regenerate) {
    return {
      error: "draft_exists",
      message:
        "לכתבה כבר יש טיוטה. לכתיבה מחדש (עלות נוספת) — regenerate=true.",
    };
  }
  return null;
}

/** A refusal when the entry's tenant has no active AI connection. */
async function llmProblem(
  db: SeoDb,
  entry: CalendarEntry,
): Promise<SeoRefusal | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("id")
    .eq("tenant_id", entry.tenant_id)
    .eq("integration_type", "llm")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  throwIfError("חיבור ה-AI של הארגון", error);
  return data
    ? null
    : {
        error: "not_connected",
        message:
          "אין חיבור AI (מפתח OpenAI) פעיל בארגון של הלקוח. מחברים בהגדרות המוחות.",
      };
}

/**
 * generate-entry marks the entry 'generating' before calling OpenAI and does
 * not undo it when it fails; put it back so it can be retried.
 */
async function releaseGenerating(
  db: SeoDb,
  ctx: SeoActionContext,
  client: SeoClient,
  entryId: string,
) {
  const entry = await loadClientEntry(db, ctx, client, { entry_id: entryId });
  if (isRefusal(entry) || entry.generation_status !== "generating") {
    return;
  }
  const { error } = await db
    .from("seo_geo_calendar_entries")
    .update({ generation_status: entry.has_content ? "draft" : "planned" })
    .eq("id", entryId)
    .eq("tenant_id", entry.tenant_id)
    .eq("generation_status", "generating");
  throwIfError("שחרור סטטוס הכתיבה", error);
}
