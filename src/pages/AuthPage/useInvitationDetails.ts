import { useEffect, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Share the email draft across forms and fetch invitation context only with a token. */
export function useInvitationDetails(inviteToken: string | null) {
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const { data, error } = useQuery({
    queryKey: ["authPage", "invitation", inviteToken],
    queryFn: inviteToken ? () => loadInvitation(inviteToken) : skipToken,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (data?.email) {
      setEmail(data.email);
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return { email, setEmail, inviteBanner: data?.banner ?? null };
}

/** Resolve an unused, unexpired invitation without caching it beyond this page. */
async function loadInvitation(inviteToken: string) {
  const { data, error } = await supabase
    .from("invitation_tokens")
    .select("email, metadata, tenants(name)")
    .eq("token", inviteToken)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const orgName =
    data.tenants?.name || readMetadataString(data.metadata, "tenant_name");
  const invitedName = readMetadataString(data.metadata, "fullName");
  const banner = !orgName
    ? null
    : invitedName
      ? `שלום ${invitedName}, הוזמנת להצטרף ל${orgName}. בדוק את המייל שלך לקישור ההתחברות, או התחבר אם כבר הגדרת סיסמה.`
      : `הוזמנת להצטרף ל${orgName}. בדוק את המייל שלך לקישור ההתחברות, או התחבר אם כבר הגדרת סיסמה.`;

  return { email: data.email, banner };
}

/** Narrow the JSON storage boundary instead of assuming metadata field types. */
function readMetadataString(metadata: Json, field: "tenant_name" | "fullName") {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = metadata[field];

  return typeof value === "string" ? value : undefined;
}
