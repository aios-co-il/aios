import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "./types";

export function usePasswordSetup(navigateToApp: NavigateToApp) {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { toast } = useToast();
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "שגיאה",
        description: "הסיסמאות אינן תואמות",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "שגיאה",
        description: "הסיסמה חייבת להכיל לפחות 6 תווים",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    toast({ title: "הסיסמה עודכנה", description: "הסיסמה שלך עודכנה בהצלחה" });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      if (!user) {
        throw new Error("לא נמצא משתמש מחובר");
      }
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }
      if (!session) {
        throw new Error("לא נמצאה התחברות פעילה");
      }
      await navigateToApp(user.id, session.access_token);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "שגיאה בהשלמת ההתחברות";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
    }
    setLoading(false);
  };

  return {
    loading,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    handleUpdatePassword,
  };
}
