import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "../types";
import { authSessionQueryOptions } from "../authSessionQuery";

export interface MfaVerification {
  factorId: string;
  navigateToApp: NavigateToApp;
  onVerificationStart: () => void;
  onVerificationEnd: () => void;
}

/** Own the TOTP draft and challenge/verification mutation lifecycle. */
export function useMfaVerification({
  factorId,
  navigateToApp,
  onVerificationStart,
  onVerificationEnd,
}: MfaVerification) {
  const [mfaCode, setMfaCode] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: verifyCode,
    onMutate: onVerificationStart,
    onSuccess: finishVerification,
    onError: showError,
    onSettled: onVerificationEnd,
    retry: false,
    gcTime: 0,
  });
  return { loading: mutation.isPending, mfaCode, setMfaCode, handleMFAVerify };

  /** Create a fresh challenge for every explicit verification attempt. */
  async function verifyCode(code: string) {
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      throw challenge.error;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (error) {
      throw error;
    }
  }

  /** Route using the SDK session updated by successful MFA verification. */
  async function finishVerification() {
    toast({ title: "הצלחה!", description: "התחברת בהצלחה" });
    const session = await queryClient.fetchQuery(authSessionQueryOptions);
    if (!session) {
      throw new Error("לא נמצאה התחברות פעילה");
    }
    await navigateToApp(session.user.id, session.access_token);
  }

  /** Preserve the entered code when verification fails. */
  function showError(error: unknown) {
    toast({
      title: "שגיאה",
      description:
        error instanceof Error ? error.message : "הקוד שגוי, נסה שוב",
      variant: "destructive",
    });
  }

  /** Reject incomplete codes before creating a challenge. */
  function handleMFAVerify(event: FormEvent) {
    event.preventDefault();
    if (!mfaCode || mfaCode.length !== 6) {
      showError(new Error("נא להזין קוד בן 6 ספרות"));
      return;
    }
    if (!factorId) {
      showError(new Error("לא נמצא מזהה גורם"));
      return;
    }
    mutation.mutate(mfaCode);
  }
}
