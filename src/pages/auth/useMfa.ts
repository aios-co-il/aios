import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "./types";

export function useMfa(navigateToApp: NavigateToApp) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const { toast } = useToast();
  const verifying = useRef(false);

  const completeSignIn: NavigateToApp = useCallback(
    async (userId, accessToken) => {
      if (verifying.current) {
        return false;
      }
      try {
        const { data, error } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) {
          throw error;
        }
        if (!data) {
          throw new Error("לא ניתן לבדוק את מצב האימות הדו-שלבי");
        }
        if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          const factors = await supabase.auth.mfa.listFactors();
          if (factors.error) {
            throw factors.error;
          }
          const factor = factors.data?.totp[0];
          if (!factor) {
            throw new Error("לא נמצא גורם אימות נתמך");
          }
          setFactorId(factor.id);
          return false;
        }
        return await navigateToApp(userId, accessToken);
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "שגיאה בבדיקת האימות הדו-שלבי";
        toast({ title: "שגיאה", description: message, variant: "destructive" });
        return false;
      }
    },
    [navigateToApp, toast],
  );

  return {
    factorId,
    completeSignIn,
    backToSignIn: () => setFactorId(null),
    onVerificationStart: () => {
      verifying.current = true;
    },
    onVerificationEnd: () => {
      verifying.current = false;
    },
  };
}
