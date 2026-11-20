import type { SeoDb, SeoRefusal } from "../seo-read/context.ts";
import { throwIfError } from "../seo-read/context.ts";
import type { SeoAction } from "./context.ts";
import { NO_COST } from "./context.ts";
import { isRefusal } from "../seo-read/client.ts";
import {
  type CalendarEntry,
  isApprovedEntry,
  loadClientEntry,
  notApproved,
} from "./entries.ts";

/**
 * publish_seo_article: marketing-seo-publish-due publishes one approved draft
 * to the program's WordPress site, live on the client's website. A published
 * entry is never published again.
 */
export const articlePublish: SeoAction = {
  async prepare(db, ctx, client, args) {
    const entry = await loadClientEntry(db, ctx, client, args);
    if (isRefusal(entry)) {
      return entry;
    }
    const problem =
      publishProblem(entry) ?? (await wordpressProblem(db, entry));
    if (problem) {
      return problem;
    }
    return {
      title: `פרסום כתבה באתר של ${client.name}: ${entry.title_draft ?? entry.title}`,
      summary: `הכתבה "${entry.title_draft ?? entry.title}" תתפרסם מיד באתר הוורדפרס של ${client.name}, גלויה לכל הגולשים.`,
      cost: {
        ...NO_COST,
        note: "ללא עלות כספית — אבל הפרסום ציבורי באתר הלקוח.",
      },
      input: { client_id: client.id, entry_id: entry.id },
    };
  },
  async run(_db, ctx, client, plan) {
    const entryId = String(plan.input.entry_id);
    const reply = await ctx.invoke("marketing-seo-publish-due", {
      entry_id: entryId,
    });
    const results = Array.isArray(reply.json.results) ? reply.json.results : [];
    const result = results.find((r) => r?.id === entryId);
    if (!reply.ok || !result?.ok) {
      console.error(
        "[seo-actions] publish-due failed:",
        reply.status,
        reply.json,
      );
      return {
        error: "publish_failed",
        message: `הפרסום נכשל: ${String(result?.error ?? reply.json.error ?? "הכתבה לא פורסמה")}`,
      };
    }
    return {
      success: true,
      client: { id: client.id, name: client.name },
      entry_id: entryId,
      live_url: result.link ?? null,
    };
  },
};

/** Why the entry cannot be published now, or null. */
function publishProblem(entry: CalendarEntry): SeoRefusal | null {
  if (entry.generation_status === "published") {
    return {
      error: "already_published",
      message: `הכתבה כבר פורסמה: ${entry.live_url ?? ""}`.trim(),
    };
  }
  if (!isApprovedEntry(entry)) {
    return notApproved(entry);
  }
  if (entry.generation_status !== "draft" || !entry.has_content) {
    return {
      error: "no_draft",
      message:
        "לכתבה אין טיוטה מוכנה. כותבים קודם עם generate_seo_article_draft.",
    };
  }
  return null;
}

/** A refusal when the entry's program has no WordPress site. */
async function wordpressProblem(
  db: SeoDb,
  entry: CalendarEntry,
): Promise<SeoRefusal | null> {
  const { data, error } = await db
    .from("seo_geo_programs")
    .select("wordpress_site_id")
    .eq("work_item_id", entry.work_item_id)
    .eq("tenant_id", entry.tenant_id)
    .maybeSingle();
  throwIfError("תוכנית ה-SEO", error);
  return data?.wordpress_site_id
    ? null
    : {
        error: "not_connected",
        message:
          "לתוכנית ה-SEO של הלקוח לא מחובר אתר וורדפרס. מחברים אתר בתוכנית ואז מפרסמים.",
      };
}
