import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "./types";
import { AUTH_REDIRECT } from "./authRedirect";

interface SignInActions {
  navigateToApp: NavigateToApp;
  email: string;
  onPasswordSignInStart: () => void;
}
export function useSignIn({
  email,
  navigateToApp,
  onPasswordSignInStart,
}: SignInActions) {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    onPasswordSignInStart();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (session?.session) {
      await navigateToApp(
        session.session.user.id,
        session.session.access_token,
      );
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: AUTH_REDIRECT },
      });
      if (error) {
        throw error;
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "שגיאה בהתחברות עם Google";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
      setLoading(false);
    }
  };

  return { loading, password, setPassword, handleSignIn, handleGoogleSignIn };
}
