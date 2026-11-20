import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctionInvoke";
import {
  type LandingDomainResult,
  normalizeDomain,
} from "../../../../supabase/functions/_shared/workshop/landing/site-domain.ts";
import { LANDING_SETTINGS } from "./useLandingSettings";

/**
 * The mutations of a landing project's site domain: save it and connect it in Vercel, or read its
 * verification. The domain belongs to the site, which other projects of the client share, so
 * every cached project's settings are read again after either.
 */
export function useLandingDomain(itemId: string) {
  const queryClient = useQueryClient();

  /** Reads every cached project's settings again. */
  function refreshAll() {
    return queryClient.invalidateQueries({ queryKey: [LANDING_SETTINGS] });
  }

  const saveDomain = useMutation({
    mutationFn: async (domain: string) => {
      const { error } = await supabase.rpc("landing_site_save_domain", {
        p_item_id: itemId,
        p_domain: normalizeDomain(domain),
      });
      if (error) {
        throw error;
      }
      return callLandingDomain("connect", itemId);
    },
    // Settled, not success: a domain saved before its connection failed is still saved.
    onSettled: refreshAll,
  });

  const checkDomain = useMutation({
    mutationFn: () => callLandingDomain("status", itemId),
    onSuccess: refreshAll,
  });

  return { saveDomain, checkDomain };
}

/** Asks landing-domain to connect the project's site domain to Vercel, or for its status. */
function callLandingDomain(
  action: "connect" | "status",
  itemId: string,
): Promise<LandingDomainResult> {
  return invokeEdgeFunction<LandingDomainResult>("landing-domain", {
    action,
    item_id: itemId,
  });
}
