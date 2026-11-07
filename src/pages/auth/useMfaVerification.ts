import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "./types";

export interface MfaVerification {
  factorId: string;
  navigateToApp: NavigateToApp;
  onVerificationStart: () => void;
  onVerificationEnd: () => void;
}
export function useMfaVerification({
  factorId,
  navigateToApp,
  onVerificationStart,
  onVerificationEnd,
}: MfaVerification) {
  const [loading, setLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const { toast } = useToast();
  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode || mfaCode.length !== 6) {
      toast({
        title: "שגיאה",
        description: "נא להזין קוד בן 6 ספרות",
        variant: "destructive",
      });
      return;
    }
    if (!factorId) {
      toast({
        title: "שגיאה",
        description: "לא נמצא מזהה גורם",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    onVerificationStart();
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        throw challenge.error;
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: mfaCode,
      });
      if (error) {
        throw error;
      }
      toast({ title: "הצלחה!", description: "התחברת בהצלחה" });
      const { data: session } = await supabase.auth.getSession();
      if (session?.session) {
        await navigateToApp(
          session.session.user.id,
          session.session.access_token,
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "הקוד שגוי, נסה שוב";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
    } finally {
      onVerificationEnd();
      setLoading(false);
    }
  };

  return { loading, mfaCode, setMfaCode, handleMFAVerify };
}
