import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "../types";
import { authSessionQueryOptions } from "../authSessionQuery";

/** Keep password drafts local and complete authenticated setup after the write. */
export function usePasswordSetup(navigateToApp: NavigateToApp) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const active = useRef(true);

  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);

  const mutation = useMutation({
    mutationFn: updatePassword,
    onSuccess: finishSetup,
    onError: showError,
    retry: false,
    gcTime: 0,
  });

  return {
    loading: mutation.isPending,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    handleUpdatePassword,
  };

  /** Update only the submitted password. */
  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw error;
    }
  }

  /** Obtain the real session token before MFA and pending-invitation processing. */
  async function finishSetup() {
    if (!active.current) {
      return;
    }

    toast({ title: "הסיסמה עודכנה", description: "הסיסמה שלך עודכנה בהצלחה" });
    const session = await queryClient.fetchQuery(authSessionQueryOptions);

    if (!active.current) {
      return;
    }

    if (!session) {
      throw new Error("לא נמצאה התחברות פעילה");
    }

    const user = await queryClient.fetchQuery({
      queryKey: ["authPage", "user", session.user.id],
      queryFn: readUser,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    });
    if (active.current) {
      await navigateToApp(user.id, session.access_token);
    }
  }

  /** Leave controls usable when the write or post-write lookup fails. */
  function showError(error: unknown) {
    toast({
      title: "שגיאה",
      description:
        error instanceof Error ? error.message : "שגיאה בהשלמת ההתחברות",
      variant: "destructive",
    });
  }

  /** Validate drafts before starting a mutation. */
  function handleUpdatePassword(event: FormEvent) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      showError(new Error("הסיסמאות אינן תואמות"));

      return;
    }

    if (newPassword.length < 6) {
      showError(new Error("הסיסמה חייבת להכיל לפחות 6 תווים"));

      return;
    }

    mutation.mutate(newPassword);
  }
}

/** Validate the current user through the SDK before completing setup. */
async function readUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("לא נמצא משתמש מחובר");
  }

  return data.user;
}
