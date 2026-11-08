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
  const version = useRef(0);

  const backToSignIn = useCallback(() => {
    version.current++;
    verifying.current = false;
    setFactorId(null);
  }, []);

  const completeSignIn: NavigateToApp = useCallback(
    async (userId, accessToken) => {
      if (verifying.current) {
        return false;
      }

      const attempt = version.current;

      try {
        const requiredFactor = await queryClient.fetchQuery(
          mfaReadinessQueryOptions(userId),
        );

        if (attempt !== version.current) {
          return false;
        }

        setFactorId(requiredFactor);

        return requiredFactor
          ? false
          : await navigateToApp(userId, accessToken);
      } catch (error: unknown) {
        if (attempt !== version.current) {
          return false;
        }

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

  /** Ignore SDK navigation while explicit verification owns completion. */
  function onVerificationStart() {
    verifying.current = true;
  }

  /** Release verification ownership after either success or failure. */
  function onVerificationEnd() {
    verifying.current = false;
  }
}
