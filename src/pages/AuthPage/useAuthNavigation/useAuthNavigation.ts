import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveAppHomePath } from "@/lib/appHomePath";
import type { AuthDestination, NavigateToApp } from "../types";

interface NavigationRequest extends AuthDestination {
  version: number;
}

/** Complete invitation side effects once, then resolve and enter the user's home. */
export function useAuthNavigation() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const version = useRef(0);
  const cancelPending = useCallback(() => {
    version.current++;
  }, []);

  // Callers await completion to preserve pending state and invitation/navigation order.
  const { mutateAsync } = useMutation({
    mutationFn: resolveDestination,
    onSuccess: enterHome,
    onError: showError,
    retry: false,
    gcTime: 0,
  });

  const navigateToApp: NavigateToApp = useCallback(
    async (userId, accessToken) => {
      const request = { userId, accessToken, version: version.current };

      try {
        const homePath = await mutateAsync(request);

        return request.version === version.current && Boolean(homePath);
      } catch {
        // The mutation's onError reports the failure; callers need a routing result.
        return false;
      }
    },
    [mutateAsync],
  );

  return { navigateToApp, cancelPending };

  /** Invitation failure remains non-blocking, as tracked in AIO-479. */
  async function resolveDestination(request: NavigationRequest) {
    const { userId, accessToken } = request;

    if (request.version !== version.current) {
      return null;
    }

    if (accessToken) {
      await processPendingInvitation(accessToken);
    }

    if (request.version !== version.current) {
      return null;
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
  function enterHome(homePath: string | null, request: NavigationRequest) {
    if (request.version !== version.current) {
      return;
    }

    if (homePath) {
      navigate(homePath, { replace: true });

      return;
    }

    showError(new Error("לא נמצא ארגון עבור המשתמש. נא לפנות לתמיכה."));
  }

  /** Show routing failures while letting the caller release its pending state. */
  function showError(error: unknown, request?: NavigationRequest) {
    if (request && request.version !== version.current) {
      return;
    }

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
