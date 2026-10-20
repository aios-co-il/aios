import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useViewAs } from "@/contexts/ViewAsContext";
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
  const { viewAsUserId } = useViewAs();
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // "View as": show Carmen the way that user would see her. Their
        // personal API key is private (RLS), so only the permissions row and
        // the owner allowlist count here.
        if (viewAsUserId) {
          const [{ data: permRow }, { data: prof }] = await Promise.all([
            (supabase as any)
              .from("carmen_command_center_access")
              .select("enabled, brain_access")
              .eq("user_id", viewAsUserId)
              .limit(1)
              .maybeSingle(),
            supabase
              .from("profiles")
              .select("email")
              .eq("id", viewAsUserId)
              .maybeSingle(),
          ]);
          const viewedEmail = String(prof?.email ?? "").toLowerCase();
          if (mounted)
            setState({
              allowed: permRow
                ? carmenEnabledFor(permRow)
                : COMMAND_CENTER_ALLOWLIST.includes(viewedEmail),
              loading: false,
            });
          return;
        }
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
  }, [viewAsUserId]);
  return state;
}
