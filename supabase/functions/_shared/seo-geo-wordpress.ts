import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wordPressSiteScopeError } from "./tenant-publish-access.ts";

type WpSite = {
  id: string;
  site_url: string;
  username: string;
  app_password: string;
};

/** Load the WordPress site a row of `scope` publishes to. Throws when the site
 * belongs to another tenant, or to another client than `scope.clientId`, so a
 * program can never publish through someone else's credentials (AIO-234). */
export async function loadWordPressSite(
  admin: SupabaseClient,
  siteId: string,
  scope: { tenantId: string; clientId: string | null },
): Promise<WpSite | null> {
  const { data } = await admin
    .from("social_media_wordpress_sites")
    .select("id,tenant_id,client_id,site_url,username,app_password")
    .eq("id", siteId)
    .maybeSingle();
  if (!data) return null;
  const scopeError = wordPressSiteScopeError(
    data as { tenant_id: string; client_id: string | null },
    scope.tenantId,
    scope.clientId,
  );
  if (scopeError) throw new Error(scopeError);
  const { id, site_url, username, app_password } = data as WpSite;
  return { id, site_url, username, app_password };
}

export async function publishToWordPress(
  site: WpSite,
  article: {
    title: string;
    contentHtml: string;
    excerpt?: string | null;
    metaDescription?: string | null;
    focusKeyword?: string | null;
    status?: "draft" | "publish";
  },
) {
  const credentials = btoa(`${site.username}:${site.app_password}`);
  const wpUrl = `${site.site_url.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const body: Record<string, unknown> = {
    title: article.title,
    content: article.contentHtml,
    status: article.status ?? "publish",
  };
  if (article.excerpt) body.excerpt = article.excerpt;
  if (article.metaDescription || article.focusKeyword) {
    body.meta = {
      ...(article.metaDescription
        ? { _yoast_wpseo_metadesc: article.metaDescription }
        : {}),
      ...(article.focusKeyword
        ? { _yoast_wpseo_focuskw: article.focusKeyword }
        : {}),
    };
  }
  const res = await fetch(wpUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      `WordPress ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  return (await res.json()) as { id: number; link: string };
}
