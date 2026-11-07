import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "../types";
import { AUTH_REDIRECT } from "../authRedirect";
import { authSessionQueryOptions } from "../authSessionQuery";

interface SignInActions {
  navigateToApp: NavigateToApp;
  email: string;
  onPasswordSignInStart: () => void;
}

/** Own password drafts and mutation lifecycles for both sign-in methods. */
export function useSignIn({
  email,
  navigateToApp,
  onPasswordSignInStart,
}: SignInActions) {
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const passwordMutation = useMutation({
    mutationFn: authenticate,
    onMutate: onPasswordSignInStart,
    onError: showError,
    retry: false,
    gcTime: 0,
  });

  const googleMutation = useMutation({
    mutationFn: startGoogleOAuth,
    onError: showError,
    retry: false,
    gcTime: 0,
  });

  return {
    loading:
      passwordMutation.isPending ||
      googleMutation.isPending ||
      googleMutation.isSuccess,
    password,
    setPassword,
    handleSignIn,
    handleGoogleSignIn,
  };

  /** Route only after the password mutation has established its session. */
  async function authenticate(credentials: {
    email: string;
    password: string;
  }) {
    const { error } = await supabase.auth.signInWithPassword(credentials);

    if (error) {
      throw error;
    }

    const session = await queryClient.fetchQuery(authSessionQueryOptions);

    if (!session) {
      throw new Error("לא נמצאה התחברות פעילה");
    }

    await navigateToApp(session.user.id, session.access_token);
  }

  /** Keep the SDK's redirect behavior and surface provider failures. */
  async function startGoogleOAuth() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: AUTH_REDIRECT },
    });

    if (error) {
      throw error;
    }
  }

  /** Mutations restore pending state after SDK and unexpected failures alike. */
  function showError(error: unknown) {
    toast({
      title: "שגיאה",
      description: error instanceof Error ? error.message : "שגיאה בהתחברות",
      variant: "destructive",
    });
  }

  /** Capture the submitted credentials rather than a later draft. */
  function handleSignIn(event: FormEvent) {
    event.preventDefault();
    passwordMutation.mutate({ email, password });
  }

  /** Keep the OAuth mutation's variables independent of the form event. */
  function handleGoogleSignIn() {
    googleMutation.mutate();
  }
}
