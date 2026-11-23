/** The link the morning brief gives to the page that approves client-card drafts. */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { tenantSlug } from "../collectors/chat/connections.ts";

/** `<appUrl>/t/<slug>/card-drafts`, or null without an app URL or a tenant slug. */
export async function cardDraftsLink(
  db: DbClient,
  tenantId: string,
  appUrl: string | null,
): Promise<string | null> {
  const slug = appUrl ? await tenantSlug(db, tenantId) : null;
  return appUrl && slug
    ? `${appUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(slug)}/card-drafts`
    : null;
}
