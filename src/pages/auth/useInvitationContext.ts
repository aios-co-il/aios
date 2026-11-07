import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useInvitationContext(inviteToken: string | null) {
  const [email, setEmail] = useState("");
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  // Load invitation context from ?token= for pre-fill and banner
  useEffect(() => {
    if (!inviteToken) {
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("invitation_tokens")
        .select("email, metadata, tenants(name)")
        .eq("token", inviteToken)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        return;
      }

      if (data.email) {
        setEmail(data.email);
      }

      const orgName =
        (data.tenants as { name?: string } | null)?.name ||
        (data.metadata as { tenant_name?: string } | null)?.tenant_name;
      const invitedName = (data.metadata as { fullName?: string } | null)
        ?.fullName;

      if (orgName) {
        setInviteBanner(
          invitedName
            ? `שלום ${invitedName}, הוזמנת להצטרף ל${orgName}. בדוק את המייל שלך לקישור ההתחברות, או התחבר אם כבר הגדרת סיסמה.`
            : `הוזמנת להצטרף ל${orgName}. בדוק את המייל שלך לקישור ההתחברות, או התחבר אם כבר הגדרת סיסמה.`,
        );
      }
    })();
  }, [inviteToken]);

  return { email, setEmail, inviteBanner };
}
