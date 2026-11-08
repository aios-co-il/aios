import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp, PasswordSignInAttempt } from "../types";
import { AUTH_REDIRECT } from "../authRedirect";
import { authSessionQueryOptions } from "../authSessionQuery";

interface SignInActions {
  navigateToApp: NavigateToApp;
  email: string;
  onPasswordSignInStart: () => PasswordSignInAttempt;
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
  async function authenticate({
    email,
    password,
    attempt,
  }: {
    email: string;
    password: string;
    attempt: PasswordSignInAttempt;
  }) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!attempt.isCurrent()) {
      return;
    }

    if (error) {
      attempt.release();
      throw error;
    }

    const session = await queryClient.fetchQuery(authSessionQueryOptions);

    if (!attempt.isCurrent()) {
      return;
    }

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
    const attempt = onPasswordSignInStart();
    passwordMutation.mutate({ email, password, attempt });
  }

  /** Keep the OAuth mutation's variables independent of the form event. */
  function handleGoogleSignIn() {
    googleMutation.mutate();
  }
}
