import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveAppHomePath } from "@/lib/appHomePath";
import type { AuthDestination, NavigateToApp } from "../types";

/** Complete invitation side effects once, then resolve and enter the user's home. */
export function useAuthNavigation() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: resolveDestination,
    onSuccess: enterHome,
    onError: showError,
    retry: false,
    gcTime: 0,
  });
  const navigateToApp: NavigateToApp = useCallback(
    async (userId, accessToken) => {
      try {
        return Boolean(await mutateAsync({ userId, accessToken }));
      } catch {
        // The mutation's onError reports the failure; callers need a routing result.
        return false;
      }
    },
    [mutateAsync],
  );
  return navigateToApp;

  /** Invitation failure remains non-blocking, as tracked in AIO-479. */
  async function resolveDestination({ userId, accessToken }: AuthDestination) {
    if (accessToken) {
      await processPendingInvitation(accessToken);
    }
    return queryClient.fetchQuery({
      queryKey: ["authPage", "home", userId],
      queryFn: () => resolveAppHomePath(userId),
      staleTime: 0,
      gcTime: 0,
      retry: false,
    });
  }

  /** Keep the missing-organization case on the auth page. */
  function enterHome(homePath: string | null) {
    if (homePath) {
      navigate(homePath, { replace: true });
      return;
    }
    showError(new Error("לא נמצא ארגון עבור המשתמש. נא לפנות לתמיכה."));
  }

  /** Show routing failures while letting the caller release its pending state. */
  function showError(error: unknown) {
    toast({
      title: "שגיאה",
      description:
        error instanceof Error ? error.message : "שגיאה בהשלמת ההתחברות",
      variant: "destructive",
    });
  }
}

/** Preserve best-effort processing and record failures instead of blocking login. */
async function processPendingInvitation(accessToken: string) {
  try {
    const { error } = await supabase.functions.invoke(
      "process-user-invitation",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (error) {
      console.error("Error processing invitation:", error);
    }
  } catch (error) {
    console.error("Exception processing invitation:", error);
  }
}
