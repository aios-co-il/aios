import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { tenantNameOf } from "../../../supabase/functions/broadcast-unsubscribe/contract.ts";

/** Why an unsubscribe failed: an expired link reads differently from an outage. */
export type UnsubscribeFailure = "not_found" | "unavailable";

/**
 * The organization name for the page header (GET ?info=1). Never unsubscribes;
 * null when the lookup fails, and the page still works without it.
 */
export function useUnsubscribeTenantName(recipientId: string | null) {
  return useQuery({
    queryKey: ["broadcast-unsubscribe-info", recipientId],
    queryFn: recipientId
      ? async () => {
          const { data, error } = await supabase.functions.invoke(
            `broadcast-unsubscribe?r=${recipientId}&info=1`,
            { method: "GET" },
          );
          if (error) {
            console.warn("[unsubscribe] tenant name lookup failed", error);
            return null;
          }
          return tenantNameOf(data);
        }
      : skipToken,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Adds the recipient to its organization's mailing blacklist (POST { r }). */
export function useUnsubscribe(recipientId: string) {
  return useMutation({
    mutationFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.functions.invoke(
        "broadcast-unsubscribe",
        { body: { r: recipientId } },
      );
      if (error) {
        throw new UnsubscribeError(await failureOf(error));
      }
      return tenantNameOf(data);
    },
  });
}

/** Carries the failure kind to the page. */
export class UnsubscribeError extends Error {
  constructor(readonly failure: UnsubscribeFailure) {
    super(failure);
  }
}

/** 404 means the link expired or never existed; anything else is an outage. */
async function failureOf(error: unknown): Promise<UnsubscribeFailure> {
  console.error("[unsubscribe] request failed", error);
  if (error instanceof FunctionsHttpError) {
    const context: unknown = error.context;
    if (context instanceof Response && context.status === 404) {
      return "not_found";
    }
  }
  return "unavailable";
}
