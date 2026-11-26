import { useEffect, useRef } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { listTrustedSites, revokeTrustedSite } from "./trustedSitesApi";

const TRUSTED_SITES_KEY = "carmen-device-trusted-sites";

/**
 * The sites trusted for this conversation, and the revoke. Read only beside the extension's
 * panel (`active`), and again each time a browser step stops waiting, since the panel
 * records a trust when it completes the step.
 */
export function useTrustedSites(
  conversationId: string | null,
  active: boolean,
  waiting: boolean,
) {
  const queryClient = useQueryClient();
  const queryKey = [TRUSTED_SITES_KEY, conversationId];
  const sites = useQuery({
    queryKey,
    queryFn:
      active && conversationId
        ? () => listTrustedSites(conversationId)
        : skipToken,
  });
  const { refetch } = sites;

  const wasWaiting = useRef(waiting);
  useEffect(() => {
    if (wasWaiting.current && !waiting && active && conversationId) {
      void refetch();
    }
    wasWaiting.current = waiting;
  }, [waiting, active, conversationId, refetch]);

  const revoke = useMutation({
    mutationFn: revokeTrustedSite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) =>
      toast.error(`ביטול האמון באתר נכשל: ${error.message}`),
  });

  return { sites: active ? (sites.data ?? []) : [], revoke };
}
