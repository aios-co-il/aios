import { useEffect } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Completes a pending user's invitation once, then reloads the app. */
export function useProcessPendingInvitation(userId: string | null | undefined) {
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: userId
      ? async () => {
          const { data, error } = await supabase
            .from("profiles")
            .select("status")
            .eq("id", userId)
            .single();
          if (error) throw error;
          return data;
        }
      : skipToken,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const pending = !!userId && userProfile?.status === "pending";
  const { data: invitation, error } = useQuery({
    queryKey: ["process-user-invitation", userId],
    queryFn: pending
      ? async () => {
          const { data, error } = await supabase.functions.invoke(
            "process-user-invitation",
          );
          if (error) throw error;
          return data as { success?: boolean } | null;
        }
      : skipToken,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (error) console.error("Error processing invitation:", error);
  }, [error]);

  useEffect(() => {
    if (invitation?.success) window.location.reload();
  }, [invitation]);
}
