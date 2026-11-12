import { useEffect } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** A team member on the client's account, kept even without an email. */
export type ClientTeamContact = {
  role_on_account: string | null;
  campaigners: { full_name: string | null; email: string };
};

/**
 * Who a client card report can go to: the client's phone, email and WhatsApp
 * group, the tenant's WhatsApp groups, and the team on this client's account.
 */
export function useClientSendContacts(clientId: string, tenantId: string) {
  const client = useQuery({
    queryKey: ["client-for-report-panel", clientId],
    queryFn: clientId ? () => fetchClient(clientId) : skipToken,
  });
  const groups = useQuery({
    queryKey: ["whatsapp-groups-for-report", tenantId],
    queryFn: tenantId ? () => fetchGroups(tenantId) : skipToken,
  });
  const teamMembers = useQuery({
    queryKey: ["client-team-emails-report", clientId],
    queryFn: clientId ? () => fetchTeam(clientId) : skipToken,
  });
  const loadError = client.error ?? groups.error;
  useEffect(() => {
    if (loadError) {
      console.error(
        `Failed to load send contacts of client ${clientId}`,
        loadError,
      );
    }
  }, [clientId, loadError]);
  return {
    client: client.data ?? null,
    groups: groups.data,
    teamMembers: teamMembers.data ?? [],
    /** The client and the groups the destination is chosen from have loaded. */
    loaded: client.isSuccess && groups.isSuccess,
    failed: !!loadError,
  };
}

/** Who a client card report can go to, as the form and the send read it. */
export type ClientSendContacts = ReturnType<typeof useClientSendContacts>;

/** The client's contact fields. */
async function fetchClient(clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, phone, email, whatsapp_group_id")
    .eq("id", clientId)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

/** The tenant's WhatsApp groups that are not blocked. */
async function fetchGroups(tenantId: string) {
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("id, group_name, group_chat_id")
    .eq("tenant_id", tenantId)
    .eq("is_blocked", false)
    .order("group_name");
  if (error) {
    throw error;
  }
  return data || [];
}

/** The active team members on this client (not the whole tenant). */
async function fetchTeam(clientId: string): Promise<Array<ClientTeamContact>> {
  const { data, error } = await supabase
    .from("client_team")
    .select(
      "role_on_account, campaigners:campaigner_id (id, full_name, email, active)",
    )
    .eq("client_id", clientId);
  if (error) {
    throw error;
  }
  return (data || []).flatMap((member) =>
    member.campaigners && member.campaigners.active !== false
      ? [
          {
            role_on_account: member.role_on_account,
            campaigners: {
              full_name: member.campaigners.full_name,
              email: member.campaigners.email || "",
            },
          },
        ]
      : [],
  );
}
