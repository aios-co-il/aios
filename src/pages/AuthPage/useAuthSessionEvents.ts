import { useEffect, type Dispatch, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authSessionQueryOptions } from "./authSessionQuery";
import type {
  AuthSessionAction,
  AuthSessionControls,
} from "./authSessionState";

/** Subscribe to SDK events while keeping terminal cleanup independent of routing ownership. */
export function useAuthSessionEvents(
  hasOAuthCode: boolean,
  controls: MutableRefObject<AuthSessionControls>,
  dispatch: Dispatch<AuthSessionAction>,
  onSignedOut?: () => void,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    let latestEvent = 0;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthEvent);

    return () => {
      active = false;
      subscription.unsubscribe();
    };

    /** Sign-out invalidates pending events before either setup or manual-login guards run. */
    async function handleAuthEvent(
      event: AuthChangeEvent,
      session: Session | null,
    ) {
      if (event === "SIGNED_OUT") {
        latestEvent++;
        controls.current.version++;
        controls.current.manual = false;
        controls.current.navigating = false;
        const cancellation = queryClient.cancelQueries({
          queryKey: authSessionQueryOptions.queryKey,
          exact: true,
        });
        queryClient.setQueryData(authSessionQueryOptions.queryKey, null);
        dispatch("signIn");
        onSignedOut?.();
        await cancellation;

        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        latestEvent++;
        controls.current.version++;
        dispatch("passwordSetup");

        return;
      }

      if (controls.current.manual) {
        return;
      }

      const signedIn =
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        !!session?.user;
      const emptyInitialSession = event === "INITIAL_SESSION" && !hasOAuthCode;

      if (!signedIn && !emptyInitialSession) {
        return;
      }

      const eventId = ++latestEvent;
      const version = controls.current.version;
      await queryClient.cancelQueries({
        queryKey: authSessionQueryOptions.queryKey,
        exact: true,
      });

      if (
        !active ||
        eventId !== latestEvent ||
        version !== controls.current.version ||
        controls.current.manual
      ) {
        return;
      }

      queryClient.setQueryData(
        authSessionQueryOptions.queryKey,
        signedIn ? session : null,
      );

      if (!signedIn) {
        dispatch("checked");
      }
    }
  }, [controls, dispatch, hasOAuthCode, onSignedOut, queryClient]);

  useEffect(() => {
    const spinnerTimeout = setTimeout(() => dispatch("checked"), 4000);

    return () => clearTimeout(spinnerTimeout);
  }, [dispatch]);
}
