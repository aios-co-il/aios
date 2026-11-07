import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NavigateToApp } from "./types";
import { authSessionQueryOptions } from "./authSessionQuery";

/** Combine a fresh session query with the SDK's ongoing auth-event subscription. */
export function useAuthSession(
  searchParams: URLSearchParams,
  navigateToApp: NavigateToApp,
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const passwordSignInOwned = useRef(false);
  const navigating = useRef(false);
  const authType = searchParams.get("type");
  const needsPasswordSetup = authType === "recovery" || authType === "invite";
  const hasOAuthCode = !!searchParams.get("code");
  const [checkingSession, setCheckingSession] = useState(!needsPasswordSetup);
  const [updatePasswordMode, setUpdatePasswordMode] =
    useState(needsPasswordSetup);
  const sessionQuery = useQuery({
    ...authSessionQueryOptions,
    enabled: !needsPasswordSetup && !updatePasswordMode,
  });
  const onPasswordSignInStart = useCallback(() => {
    passwordSignInOwned.current = true;
  }, []);
  const goToApp = useCallback(
    async (session: Session) => {
      if (navigating.current || passwordSignInOwned.current) {
        return;
      }
      navigating.current = true;
      setCheckingSession(true);
      const ok = await navigateToApp(session.user.id, session.access_token);
      if (!ok) {
        navigating.current = false;
        setCheckingSession(false);
      }
    },
    [navigateToApp],
  );

  useEffect(() => {
    const spinnerTimeout = setTimeout(() => setCheckingSession(false), 4000);
    return () => clearTimeout(spinnerTimeout);
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthEvent);
    return () => subscription.unsubscribe();

    /** SDK events update the session query; only the page effect initiates routing. */
    async function handleAuthEvent(
      event: AuthChangeEvent,
      session: Session | null,
    ) {
      if (event === "PASSWORD_RECOVERY" || needsPasswordSetup) {
        setUpdatePasswordMode(true);
        setCheckingSession(false);
        return;
      }
      if (passwordSignInOwned.current) {
        return;
      }
      if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session?.user
      ) {
        await queryClient.cancelQueries({
          queryKey: authSessionQueryOptions.queryKey,
          exact: true,
        });
        queryClient.setQueryData(authSessionQueryOptions.queryKey, session);
      } else if (
        (event === "INITIAL_SESSION" && !hasOAuthCode) ||
        event === "SIGNED_OUT"
      ) {
        await queryClient.cancelQueries({
          queryKey: authSessionQueryOptions.queryKey,
          exact: true,
        });
        queryClient.setQueryData(authSessionQueryOptions.queryKey, null);
        setCheckingSession(false);
      }
    }
  }, [hasOAuthCode, needsPasswordSetup, queryClient]);

  useEffect(() => {
    if (
      needsPasswordSetup ||
      updatePasswordMode ||
      passwordSignInOwned.current ||
      sessionQuery.isFetching
    ) {
      return;
    }
    if (sessionQuery.error) {
      toast({
        title: "שגיאה",
        description: sessionQuery.error.message,
        variant: "destructive",
      });
      setCheckingSession(false);
    } else if (sessionQuery.data?.user) {
      void goToApp(sessionQuery.data);
    } else if (sessionQuery.isSuccess && !hasOAuthCode) {
      setCheckingSession(false);
    }
  }, [
    needsPasswordSetup,
    updatePasswordMode,
    sessionQuery.data,
    sessionQuery.dataUpdatedAt,
    sessionQuery.error,
    sessionQuery.isFetching,
    sessionQuery.isSuccess,
    hasOAuthCode,
    goToApp,
    toast,
  ]);

  return { checkingSession, updatePasswordMode, onPasswordSignInStart };
}
