import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  completeGoogleConnect,
  connectErrorMessage,
} from "@/lib/googleConnect";
import { takeStashedConnect } from "@/lib/googleConnectFragment";

/**
 * Finishes a full-page Google connect (Analytics, Search Console, Ads): the
 * callback sends the user back with the code in the URL fragment, which
 * main.tsx stashes at startup (googleConnectFragment.ts). Mounted in the
 * signed-in app shell, so it also runs after a sign-in that dropped the
 * fragment, and sends the code to `complete` with the user's session.
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
      toast.error(`החיבור ל-Google נכשל: ${error.message}`);
    },
  });

  useEffect(() => {
    const connect = takeStashedConnect();
    if (!connect) {
      return;
    }

    if ("error" in connect) {
      console.error("Google connect returned an error:", connect);
      toast.error(connectErrorMessage(connect.error));
      return;
    }

    mutate(connect.code);
  }, [mutate]);
}
