import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "../types";
import { mfaReadinessQueryOptions } from "./mfaReadinessQuery";

/** Coordinate required MFA across restored sessions, sign-in, and password setup. */
export function useMfa(navigateToApp: NavigateToApp) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const verifying = useRef(false);

  const completeSignIn: NavigateToApp = useCallback(
    async (userId, accessToken) => {
      if (verifying.current) {
        return false;
      }

      try {
        const requiredFactor = await queryClient.fetchQuery(
          mfaReadinessQueryOptions(userId),
        );
        setFactorId(requiredFactor);

        return requiredFactor
          ? false
          : await navigateToApp(userId, accessToken);
      } catch (error: unknown) {
        toast({
          title: "שגיאה",
          description:
            error instanceof Error
              ? error.message
              : "שגיאה בבדיקת האימות הדו-שלבי",
          variant: "destructive",
        });

        return false;
      }
    },
    [navigateToApp, queryClient, toast],
  );

  return {
    factorId,
    completeSignIn,
    backToSignIn,
    onVerificationStart,
    onVerificationEnd,
  };

  /** Leaving the challenge unmounts its local code draft. */
  function backToSignIn() {
    setFactorId(null);
  }

  /** Ignore SDK navigation while explicit verification owns completion. */
  function onVerificationStart() {
    verifying.current = true;
  }

  /** Release verification ownership after either success or failure. */
  function onVerificationEnd() {
    verifying.current = false;
  }
}
