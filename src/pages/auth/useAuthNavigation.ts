import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveAppHomePath } from "@/lib/appHomePath";

async function processPendingInvitation(accessToken: string) {
  try {
    const { error } = await supabase.functions.invoke(
      "process-user-invitation",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (error) {
      console.error("Error processing invitation:", error);
    }
  } catch (e) {
    console.error("Exception processing invitation:", e);
  }
}

export function useAuthNavigation() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const navigateToApp = useCallback(
    async (userId: string, accessToken?: string) => {
      if (accessToken) {
        await processPendingInvitation(accessToken);
      }

      const homePath = await resolveAppHomePath(userId);
      if (homePath) {
        navigate(homePath, { replace: true });
        return true;
      }

      toast({
        title: "שגיאה",
        description: "לא נמצא ארגון עבור המשתמש. נא לפנות לתמיכה.",
        variant: "destructive",
      });
      return false;
    },
    [navigate, toast],
  );

  return navigateToApp;
}
