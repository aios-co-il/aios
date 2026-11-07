import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AUTH_REDIRECT } from "../authRedirect";

/** Submit recovery requests once and let the mutation own pending/error state. */
export function usePasswordReset(email: string, onComplete: () => void) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: requestReset,
    onSuccess: showConfirmation,
    onError: showError,
    retry: false,
    gcTime: 0,
  });

  return { loading: mutation.isPending, handleResetPassword };

  /** Pass the recovery mode through the emailed redirect URL. */
  async function requestReset(submittedEmail: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      submittedEmail,
      {
        redirectTo: `${AUTH_REDIRECT}?type=recovery`,
      },
    );

    if (error) {
      throw error;
    }
  }

  /** Return to sign-in only after the SDK accepts the reset request. */
  function showConfirmation() {
    toast({
      title: "נשלח קישור לאיפוס סיסמה",
      description:
        "בדוק את תיבת המייל שלך ולחץ על הקישור כדי להגדיר סיסמה חדשה.",
    });
    onComplete();
  }

  /** Keep failed requests visible and leave the draft available to retry. */
  function showError(error: unknown) {
    toast({
      title: "שגיאה",
      description:
        error instanceof Error ? error.message : "שגיאה בשליחת קישור איפוס",
      variant: "destructive",
    });
  }

  /** Capture the email at submission time. */
  function handleResetPassword(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(email);
  }
}
