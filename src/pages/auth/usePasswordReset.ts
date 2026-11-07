import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AUTH_REDIRECT } from "./authRedirect";

export function usePasswordReset(email: string, onComplete: () => void) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${AUTH_REDIRECT}?type=recovery`,
      });
      if (error) {
        throw error;
      }

      toast({
        title: "נשלח קישור לאיפוס סיסמה",
        description:
          "בדוק את תיבת המייל שלך ולחץ על הקישור כדי להגדיר סיסמה חדשה.",
      });
      onComplete();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "שגיאה בשליחת קישור איפוס";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return { loading, handleResetPassword };
}
