import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { carmenEnabledFor } from "../../../supabase/functions/_shared/carmen-brain-access";

// Owners who may use the ORG OpenAI key. Everyone else gets access by adding
// a personal API key (user_api_keys) in their profile — bring-your-own-key.
// Mirrored server-side in the carmen voice edge functions.
export const COMMAND_CENTER_ALLOWLIST = ["david.castelnuovo@gmail.com"];

export function useCommandCenterAccess(): {
  allowed: boolean;
  loading: boolean;
} {
  const [state, setState] = useState({ allowed: false, loading: true });
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email?.toLowerCase() ?? "";
        if (COMMAND_CENTER_ALLOWLIST.includes(email)) {
          if (mounted) setState({ allowed: true, loading: false });
          return;
        }
        // A permissions row set in Carmen settings → הרשאות decides first.
        const uid = data.user?.id;
        if (uid) {
          const { data: permRow } = await (supabase as any)
            .from("carmen_command_center_access")
            .select("enabled, brain_access")
            .eq("user_id", uid)
            .limit(1)
            .maybeSingle();
          if (permRow) {
            if (mounted)
              setState({ allowed: carmenEnabledFor(permRow), loading: false });
            return;
          }
        }
        // Any user with a personal key gets in (RLS: own row only)
        const { data: keyRow } = await (supabase as any)
          .from("user_api_keys")
          .select("user_id")
          .limit(1)
          .maybeSingle();
        if (mounted) setState({ allowed: !!keyRow, loading: false });
      } catch {
        if (mounted) setState({ allowed: false, loading: false });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return state;
}
