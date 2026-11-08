import { useEffect, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { z } from "zod";
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

  const metadata = metadataSchema.parse(data.metadata);
  const orgName = data.tenants?.name || metadata.tenant_name;
  const invitedName = metadata.fullName;
  const banner = !orgName
    ? null
    : invitedName
      ? `שלום ${invitedName}, הוזמנת להצטרף ל${orgName}. בדוק את המייל שלך לקישור ההתחברות, או התחבר אם כבר הגדרת סיסמה.`
      : `הוזמנת להצטרף ל${orgName}. בדוק את המייל שלך לקישור ההתחברות, או התחבר אם כבר הגדרת סיסמה.`;

  return { email: data.email, banner };
}

// Optional display metadata tolerates invalid fields independently.
const metadataSchema = z
  .object({
    tenant_name: z.string().optional().catch(undefined),
    fullName: z.string().optional().catch(undefined),
  })
  .catch({});
