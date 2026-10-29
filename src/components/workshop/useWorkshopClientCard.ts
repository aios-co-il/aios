import { skipToken, useQuery } from "@tanstack/react-query";
import { startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/** Whose card a block reads, and whether it may read yet. */
interface CardScope {
  tenantId: string | undefined;
  clientId: string;
  enabled?: boolean;
}

/** A block of the card: a failed or blocked read shows "—", never an error. */
function useBlock<T>(
  key: string,
  { tenantId, clientId, enabled = true }: CardScope,
  read: (tenantId: string) => Promise<T>,
) {
  return useQuery({
    queryKey: ["workshop-client-card", key, tenantId, clientId],
    queryFn:
      tenantId && enabled
        ? async (): Promise<T | null> => {
            try {
              return await read(tenantId);
            } catch {
              return null;
            }
          }
        : skipToken,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * What the workshop's client card shows; each read on its own, so one failure blanks one block.
 * Only a client the client picker lists (the tenant's active clients) has a card: any other id
 * reads like an unknown client, with no name and no blocks. Every block counts the tenant's own
 * rows, as the department screens do.
 */
export function useWorkshopClientCard(
  tenantId: string | undefined,
  clientId: string,
) {
  const client = useBlock("client", { tenantId, clientId }, async (tenant) => {
    const { data, error } = await supabase
      .from("clients")
      .select("id,name,website")
      .eq("id", clientId)
      .eq("tenant_id", tenant)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data as { id: string; name: string; website: string | null } | null;
  });
  const listed: CardScope = { tenantId, clientId, enabled: !!client.data };

  // Explicit safe columns only: the table also holds the site's app password and API keys.
  const sites = useBlock("wordpress", listed, async (tenant) => {
    const { data, error } = await supabase
      .from("social_media_wordpress_sites")
      .select("id,site_name,site_url,is_active")
      .eq("tenant_id", tenant)
      .eq("client_id", clientId)
      .order("site_name");
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      site_name: string | null;
      site_url: string;
      is_active: boolean | null;
    }>;
  });

  const seoReport = useBlock("seo-monthly", listed, async (tenant) => {
    const { data, error } = await supabase
      .from("seo_monthly_updates")
      .select("month,status")
      .eq("tenant_id", tenant)
      .eq("client_id", clientId)
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as { month: string; status: string } | null;
  });

  // Active projects and keywords only, the numbers the SEO / GEO screen shows for the client.
  const ranks = useBlock("rank-tracking", listed, async (tenant) => {
    const { data, error } = await supabase
      .from("rank_tracking_projects")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("client_id", clientId)
      .eq("is_active", true);
    if (error) throw error;
    const ids = (data ?? []).map((row) => row.id as string);
    if (ids.length === 0) return null;
    const keywords = await supabase
      .from("rank_tracking_keywords")
      .select("id", { count: "exact", head: true })
      .in("project_id", ids)
      .eq("is_active", true);
    if (keywords.error) throw keywords.error;
    return { projects: ids.length, keywords: keywords.count ?? 0 };
  });

  // No snapshot covers the last 28 days: prev_month is the 28 days that ended 30 days ago, summed
  // over its top 1000 queries (anonymised queries are not in it). The card shows its dates.
  const gsc = useBlock("gsc-clicks", listed, async (tenant) => {
    const { data, error } = await supabase
      .from("gsc_keyword_snapshots")
      .select("site_url,start_date,end_date,keywords")
      .eq("tenant_id", tenant)
      .eq("client_id", clientId)
      .eq("period_key", "prev_month");
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return null;
    let clicks = 0;
    for (const row of rows)
      for (const keyword of Array.isArray(row.keywords) ? row.keywords : [])
        clicks += Number((keyword as { clicks?: unknown })?.clicks) || 0;
    return {
      clicks,
      start: rows[0].start_date as string,
      end: rows[0].end_date as string,
    };
  });

  // Only articles on PBN sites: publishing_articles also holds client WordPress and custom-API posts.
  const pbn = useBlock("pbn-month", listed, async (tenant) => {
    const { count, error } = await supabase
      .from("publishing_articles")
      .select("id, publishing_sites!inner(destination_type)", {
        count: "exact",
        head: true,
      })
      .eq("publishing_sites.destination_type", "pbn")
      .eq("tenant_id", tenant)
      .eq("client_id", clientId)
      .eq("status", "published")
      .gte("published_at", startOfMonth(new Date()).toISOString());
    if (error) throw error;
    return count || null;
  });

  return { client, sites, seoReport, ranks, gsc, pbn };
}
