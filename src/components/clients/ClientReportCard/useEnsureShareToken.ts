import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Where a report's share token is read and, when missing, made. */
export type ShareTokenSource = {
  queryKey: ReadonlyArray<unknown>;
  /** The newest active token, or null when the report has none. */
  readActive: () => Promise<string | null>;
  /** Reactivates the newest share row or creates one; resolves with its token. */
  ensure: () => Promise<string>;
};

/**
 * The share token the client card renders the live report with. A report that
 * has no active share link gets one on first open, the way the share dialogs
 * make one, so the card works without a trip to the share dialog.
 */
export function useEnsureShareToken(source: ShareTokenSource) {
  const queryClient = useQueryClient();
  const active = useQuery({
    queryKey: source.queryKey,
    queryFn: source.readActive,
  });
  const { mutate, isIdle, isError } = useMutation({
    mutationFn: source.ensure,
    onSuccess: (token) => queryClient.setQueryData(source.queryKey, token),
    onError: (error) => console.error("Failed to create share link", error),
  });

  useEffect(() => {
    if (active.data === null && isIdle) {
      mutate();
    }
  }, [active.data, isIdle, mutate]);

  return { token: active.data ?? null, failed: active.isError || isError };
}

/** The signed-in user, whom a new share row records as its creator. */
export async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user.id;
}
