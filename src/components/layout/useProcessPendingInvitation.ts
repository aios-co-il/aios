import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Completes a pending user's invitation once, then reloads the app. */
export function useProcessPendingInvitation(userId: string | null | undefined) {
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  useEffect(() => {
    const processInvitation = async () => {
      if (!userId || !userProfile || userProfile.status !== "pending") {
        return;
      }

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) return;

        const { data, error } = await supabase.functions.invoke(
          "process-user-invitation",
          {
            headers: {
              Authorization: `Bearer ${session.session.access_token}`,
            },
          },
        );

        if (error) {
          console.error("Error processing invitation:", error);
        } else if (data?.success) {
          window.location.reload();
        }
      } catch (error) {
        console.error("Error calling process-user-invitation:", error);
      }
    };

    processInvitation();
  }, [userId, userProfile]);
}
