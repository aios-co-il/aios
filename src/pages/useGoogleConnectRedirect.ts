import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  completeGoogleConnect,
  fragmentConnectCode,
} from "@/lib/googleConnect";

/**
 * Finishes a full-page Google connect (Analytics, Search Console, Ads): the
 * callback sends the user to the integrations page with the code in the URL
 * fragment, and this sends it to `complete` with the signed-in session. The
 * fragment is cleared first, so a reload never sends the code twice.
 */
export function useGoogleConnectRedirect(): void {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: completeGoogleConnect,
    onSuccess: () => {
      // The integration badges (useUserIntegrations) may have loaded before the connect was saved.
      queryClient.invalidateQueries({ queryKey: ["user-integrations"] });
      toast.success("חשבון Google חובר בהצלחה");
    },
    onError: (error) => {
      console.error("Google connect failed:", error);
      toast.error("החיבור ל-Google נכשל. נסו להתחבר שוב.");
    },
  });

  useEffect(() => {
    const code = fragmentConnectCode(window.location.hash);
    if (!code) {
      return;
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    mutate(code);
  }, [mutate]);
}
