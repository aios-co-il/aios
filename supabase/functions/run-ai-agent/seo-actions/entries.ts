import type { SeoClient, SeoDb, SeoRefusal } from "../seo-read/context.ts";
import { throwIfError } from "../seo-read/context.ts";
import type { SeoActionContext } from "./context.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The calendar entry fields the article actions check. */
export type CalendarEntry = {
  id: string;
  tenant_id: string;
  work_item_id: string;
  title: string;
  title_draft: string | null;
  primary_keyword: string | null;
  approval_status: string;
  generation_status: string;
  live_url: string | null;
  has_content: boolean;
};

/**
 * The client's calendar entry named by `entry_id`, in the caller's tenants, or
 * a refusal: an entry of another client reads as not found.
 */
export async function loadClientEntry(
  db: SeoDb,
  ctx: SeoActionContext,
  client: SeoClient,
  args: Record<string, unknown>,
): Promise<CalendarEntry | SeoRefusal> {
  const entryId = typeof args.entry_id === "string" ? args.entry_id.trim() : "";
  if (!UUID.test(entryId)) {
    console.warn("[seo-actions] rejected entry_id:", args.entry_id);
    return {
      error: "invalid_args",
      message:
        "נדרש entry_id (מזהה כתבה בלוח התוכן). מוצאים אותו ב-get_seo_program.",
    };
  }
  const { data, error } = await db
    .from("seo_geo_calendar_entries")
    .select(
      "id, tenant_id, work_item_id, title, title_draft, primary_keyword, approval_status, generation_status, live_url, content_html",
    )
    .eq("id", entryId)
    .eq("client_id", client.id)
    .in("tenant_id", ctx.accessibleTenantIds)
    .maybeSingle();
  throwIfError("כתבת לוח התוכן", error);
  if (!data) {
    return {
      error: "entry_not_found",
      message: `הכתבה לא נמצאה בלוח התוכן של ${client.name}.`,
    };
  }
  const { content_html, ...entry } = data;
  return { ...entry, has_content: !!String(content_html ?? "").trim() };
}

/** The entry is approved (by a person or the program's auto-approve). */
export function isApprovedEntry(entry: CalendarEntry): boolean {
  return (
    entry.approval_status === "approved" ||
    entry.approval_status === "auto_approved"
  );
}

/** A refusal for an entry nobody approved yet. */
export function notApproved(entry: CalendarEntry): SeoRefusal {
  return {
    error: "entry_not_approved",
    message: `הכתבה "${entry.title}" עוד לא אושרה בלוח התוכן. מאשרים אותה במחלקת ה-SEO ואז ממשיכים.`,
  };
}
