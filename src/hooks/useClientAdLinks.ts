import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientAdLinks } from "@/lib/adAccountUrl";

/**
 * The direct ads-account links saved on a client card. `loading` stays true
 * until the lookup settles, so callers hold back the link built from the
 * account id instead of flashing it before a saved link arrives.
 */
export function useClientAdLinks(clientId: string | null | undefined): {
  links: ClientAdLinks | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["client-ad-links", clientId],
    queryFn: clientId
      ? async (): Promise<ClientAdLinks | null> => {
          const { data, error } = await supabase
            .from("clients")
            .select("google_ads_url, meta_ads_url")
            .eq("id", clientId)
            .maybeSingle();
          if (error) {
            throw error;
          }
          return data;
        }
      : skipToken,
    staleTime: 5 * 60 * 1000,
  });
  return { links: query.data ?? null, loading: query.isLoading };
}
