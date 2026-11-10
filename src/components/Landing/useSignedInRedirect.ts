import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveAppHomePath } from "@/lib/appHomePath";

/** Sends a signed-in visitor from the marketing homepage to their app home. */
export function useSignedInRedirect(): void {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function goHome(userId: string) {
      const homePath = await resolveAppHomePath(userId);
      if (homePath && !cancelled) {
        navigate(homePath, { replace: true });
      }
    }

    async function redirectSignedIn() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user && !cancelled) {
        await goHome(session.user.id);
      }
    }

    void redirectSignedIn();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void goHome(session.user.id);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);
}
