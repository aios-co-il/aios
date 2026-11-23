import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
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

/** landing-domain's answer, checked before the panel reads it. */
const LANDING_DOMAIN_RESULT = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false), message: z.string() }),
  z.object({
    available: z.literal(true),
    domain: z.string().nullable(),
    connected: z.boolean(),
    verified: z.boolean(),
    records: z.array(
      z.object({
        type: z.enum(["A", "CNAME", "TXT"]),
        name: z.string(),
        value: z.string(),
      }),
    ),
  }),
]) satisfies z.ZodType<LandingDomainResult>;

/**
 * Asks landing-domain to connect the project's site domain to Vercel, or for its status. An
 * answer of another shape fails the mutation instead of reaching the panel.
 */
async function callLandingDomain(
  action: "connect" | "status",
  itemId: string,
): Promise<LandingDomainResult> {
  const answer: unknown = await invokeEdgeFunction("landing-domain", {
    action,
    item_id: itemId,
  });
  const parsed = LANDING_DOMAIN_RESULT.safeParse(answer);
  if (!parsed.success) {
    console.error("[useLandingDomain] unexpected answer", parsed.error.issues);
    throw new Error("תשובה לא צפויה מחיבור הדומיין");
  }
  return parsed.data;
}
