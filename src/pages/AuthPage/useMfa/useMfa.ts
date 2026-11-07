import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { AuthDestination, NavigateToApp } from "../types";
import { mfaReadinessQueryOptions } from "./mfaReadinessQuery";

/** Coordinate required MFA across restored sessions, sign-in, and password setup. */
export function useMfa(navigateToApp: NavigateToApp) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const verifying = useRef(false);

  const { mutateAsync } = useMutation({
    mutationFn: checkReadiness,
    onSuccess: selectFactor,
    onError: showError,
    retry: false,
    gcTime: 0,
  });

  const completeSignIn: NavigateToApp = useCallback(
    async (userId, accessToken) => {
      if (verifying.current) {
        return false;
      }

      try {
        return (await mutateAsync({ userId, accessToken })).navigated;
      } catch {
        // onError provides visible feedback; bootstrap uses false to release its spinner.
        return false;
      }
    },
    [mutateAsync],
  );

  return {
    factorId,
    completeSignIn,
    backToSignIn,
    onVerificationStart,
    onVerificationEnd,
  };

  /** Keep reads fresh while the mutation owns this completion attempt. */
  async function checkReadiness({ userId, accessToken }: AuthDestination) {
    const requiredFactor = await queryClient.fetchQuery(
      mfaReadinessQueryOptions(userId),
    );

    return {
      factorId: requiredFactor,
      navigated: requiredFactor
        ? false
        : await navigateToApp(userId, accessToken),
    };
  }

  /** Display a required factor before the caller finishes its pending state. */
  function selectFactor(result: { factorId: string | null }) {
    setFactorId(result.factorId);
  }

  /** Readiness failures leave authentication controls usable without routing. */
  function showError(error: unknown) {
    toast({
      title: "שגיאה",
      description:
        error instanceof Error ? error.message : "שגיאה בבדיקת האימות הדו-שלבי",
      variant: "destructive",
    });
  }

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
