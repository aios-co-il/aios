import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NavigateToApp } from "./types";

export function useAuthSession(
  searchParams: URLSearchParams,
  navigateToApp: NavigateToApp,
) {
  const passwordSignInOwned = useRef(false);
  const onPasswordSignInStart = useCallback(() => {
    passwordSignInOwned.current = true;
  }, []);
  const authType = searchParams.get("type");
  const needsPasswordSetup = authType === "recovery" || authType === "invite";
  const [checkingSession, setCheckingSession] = useState(true);
  const [updatePasswordMode, setUpdatePasswordMode] = useState(false);
  useEffect(() => {
    const hasOAuthCode = !!searchParams.get("code");
    let navigated = false;

    const spinnerTimeout = setTimeout(() => setCheckingSession(false), 4000);

    const goToApp = async (session: {
      user: { id: string };
      access_token: string;
    }) => {
      if (navigated || needsPasswordSetup || passwordSignInOwned.current) {
        return;
      }
      navigated = true;
      setCheckingSession(true);
      const ok = await navigateToApp(session.user.id, session.access_token);
      if (!ok) {
        navigated = false;
        setCheckingSession(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || needsPasswordSetup) {
        setUpdatePasswordMode(true);
        setCheckingSession(false);
        return;
      }
      if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session?.user
      ) {
        goToApp(session);
      } else if (
        (event === "INITIAL_SESSION" && !hasOAuthCode) ||
        event === "SIGNED_OUT"
      ) {
        setCheckingSession(false);
      }
    });

    (async () => {
      if (needsPasswordSetup) {
        setUpdatePasswordMode(true);
        setCheckingSession(false);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        goToApp(session);
      } else if (!hasOAuthCode) {
        setCheckingSession(false);
      }
    })();

    return () => {
      clearTimeout(spinnerTimeout);
      subscription.unsubscribe();
    };
  }, [searchParams, needsPasswordSetup, navigateToApp]);

  return { checkingSession, updatePasswordMode, onPasswordSignInStart };
}
