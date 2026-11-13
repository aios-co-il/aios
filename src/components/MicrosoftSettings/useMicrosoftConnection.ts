import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMicrosoftStatus,
  MICROSOFT_STATUS_QUERY_KEY,
} from "@/lib/microsoftConnection";
import { requireTenantId } from "@/lib/requireTenantId";

/** The user's Microsoft connection with connect (OAuth popup) and disconnect. */
export function useMicrosoftConnection(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: MICROSOFT_STATUS_QUERY_KEY,
    queryFn: fetchMicrosoftStatus,
  });

  const refreshStatus = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: MICROSOFT_STATUS_QUERY_KEY }),
    [queryClient],
  );
  useOAuthPopupResult(refreshStatus);

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        authUrl: string;
      }>("microsoft-auth", {
        body: { action: "init", tenantId: requireTenantId(tenantId) },
      });
      if (error) {
        throw error;
      }
      if (!data?.authUrl) {
        throw new Error("microsoft-auth returned no authUrl");
      }
      window.open(data.authUrl, "microsoft-auth", "width=600,height=700");
    },
    onError: (e) => {
      console.error("Microsoft connect failed", e);
      toast.error("שגיאה בחיבור Microsoft");
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("microsoft-auth", {
        body: { action: "disconnect" },
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      refreshStatus();
      toast.success("Microsoft נותק");
    },
    onError: (e) => {
      console.error("Microsoft disconnect failed", e);
      toast.error("שגיאה בניתוק Microsoft");
    },
  });

  return { status, connect, disconnect };
}

/** Listens for the popup's outcome message and toasts it. */
function useOAuthPopupResult(onConnected: () => void) {
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "microsoft_connected") {
        onConnected();
        toast.success("Microsoft התחבר בהצלחה!");
      } else if (event.data?.type === "microsoft_error") {
        toast.error("החיבור ל-Microsoft לא הושלם");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onConnected]);
}
