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
  const verifying = useRef<symbol | null>(null);
  const version = useRef(0);

  const backToSignIn = useCallback(() => {
    version.current++;
    verifying.current = null;
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
  };

  /** Each verification releases only its own ownership, even after sign-out. */
  function onVerificationStart() {
    const owner = Symbol("verification");
    verifying.current = owner;

    /** Old settlements and unmount cleanup cannot release a newer attempt. */
    return function release() {
      if (verifying.current === owner) {
        verifying.current = null;
      }
    };
  }
}
