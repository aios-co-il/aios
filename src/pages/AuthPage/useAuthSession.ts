import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { parseAuthType, type NavigateToApp } from "./types";
import { authSessionQueryOptions } from "./authSessionQuery";
import {
  authSessionReducer,
  type AuthSessionControls,
} from "./authSessionState";
import { useAuthSessionEvents } from "./useAuthSessionEvents";

/** Keep rendered session modes in a reducer and synchronous SDK ownership in refs. */
export function useAuthSession(
  searchParams: URLSearchParams,
  navigateToApp: NavigateToApp,
  onSignedOut?: () => void,
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authType = parseAuthType(searchParams.get("type"));
  const needsPasswordSetup = authType !== null;
  const hasOAuthCode = !!searchParams.get("code");
  const [view, dispatch] = useReducer(
    authSessionReducer,
    needsPasswordSetup ? "passwordSetup" : "checking",
  );
  // SDK events can arrive before React commits a state update.
  const controls = useRef<AuthSessionControls>({
    manual: false,
    navigating: false,
    version: 0,
  });

  const updatePasswordMode = view === "passwordSetup";

  const sessionQuery = useQuery({
    ...authSessionQueryOptions,
    enabled: !needsPasswordSetup && !updatePasswordMode,
  });

  const onPasswordSignInStart = useCallback(() => {
    controls.current.manual = true;
    controls.current.navigating = false;
    const version = ++controls.current.version;
    void queryClient.cancelQueries({
      queryKey: authSessionQueryOptions.queryKey,
      exact: true,
    });

    /** Release only a rejected attempt that still owns completion. */
    function release() {
      if (version === controls.current.version) {
        controls.current.manual = false;
      }
    }

    return {
      release,
      isCurrent: function isCurrent() {
        return version === controls.current.version;
      },
    };
  }, [queryClient]);

  const exitPasswordSetup = useCallback(() => {
    controls.current.manual = true;
    controls.current.navigating = false;
    controls.current.version++;
    dispatch("signIn");
  }, []);

  const goToApp = useCallback(
    async (session: Session) => {
      if (controls.current.navigating || controls.current.manual) {
        return;
      }

      const version = controls.current.version;
      controls.current.navigating = true;
      dispatch("checking");
      const ok = await navigateToApp(session.user.id, session.access_token);

      if (version !== controls.current.version || controls.current.manual) {
        return;
      }

      if (!ok) {
        controls.current.navigating = false;
        dispatch("checked");
      }
    },
    [navigateToApp],
  );

  useAuthSessionEvents(hasOAuthCode, controls, dispatch, onSignedOut);

  useEffect(() => {
    if (authType) {
      dispatch("passwordSetup");
    }
  }, [authType]);

  useEffect(() => {
    if (
      needsPasswordSetup ||
      updatePasswordMode ||
      controls.current.manual ||
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
      dispatch("checked");
    } else if (sessionQuery.data?.user) {
      void goToApp(sessionQuery.data);
    } else if (sessionQuery.isSuccess && !hasOAuthCode) {
      dispatch("checked");
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

  return {
    checkingSession: view === "checking",
    updatePasswordMode,
    onPasswordSignInStart,
    exitPasswordSetup,
  };
}
