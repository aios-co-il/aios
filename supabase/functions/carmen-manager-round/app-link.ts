/**
 * Links from the round's messages into the tenant's pages in the AIOS app
 * (the chat collector's chat links, the brief's card-drafts link).
 *
 * The origin is APP_URL as configured per environment, and there is no
 * fallback: without it no link is built, so Staging never links to
 * Production (appOrigin() in _shared/carmen/skin-gallery.ts falls back to
 * the production origin, which is right for portraits but not here).
 */
import { throwIf } from "../_shared/manager-round/db-error.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** `<appUrl>/t/<slug>/<path>`, or null without an app URL or a tenant slug. */
export async function tenantAppLink(
  db: DbClient,
  tenantId: string,
  appUrl: string | null,
  path: string,
): Promise<string | null> {
  const slug = appUrl ? await tenantSlug(db, tenantId) : null;
  return appUrl && slug
    ? `${appUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(slug)}/${path}`
    : null;
}

/** The tenant's URL slug, or null when it has none. */
async function tenantSlug(
  db: DbClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  throwIf(error, "tenants");
  return data?.slug ?? null;
}
