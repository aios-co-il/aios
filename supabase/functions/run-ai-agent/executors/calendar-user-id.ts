import type { DbClient } from "../../_shared/supabase-clients.ts";

/** Select the calendar owner in caller, explicit user, campaigner, then tenant-owner order. */
export async function resolveGoogleCalendarUserId(
  supabase: DbClient,
  tenantId: string,
  callerCampaignerId: string | null,
  userId: string | null,
): Promise<string | null> {
  let calTokenUserId: string | null = null;
  if (callerCampaignerId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("campaigner_id", callerCampaignerId)
      .maybeSingle();
    if (prof?.id) {
      calTokenUserId = prof.id;
    }
  }
  if (!calTokenUserId && userId && userId !== "system") {
    calTokenUserId = userId;
  }
  if (!calTokenUserId) {
    const { data: tenantCampaigners } = await supabase
      .from("campaigners")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(20);
    for (const c of tenantCampaigners || []) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("campaigner_id", c.id)
        .maybeSingle();
      if (!prof?.id) {
        continue;
      }
      const { data: tok } = await supabase
        .from("calendar_tokens")
        .select("user_id")
        .eq("user_id", prof.id)
        .maybeSingle();
      if (tok?.user_id) {
        calTokenUserId = tok.user_id;
        break;
      }
    }
  }
  if (!calTokenUserId) {
    // Owners (e.g. a second-tenant owner) are tenant_users without a campaigner row.
    const { data: owners } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"])
      .limit(10);
    for (const o of owners || []) {
      const { data: tok } = await supabase
        .from("calendar_tokens")
        .select("user_id")
        .eq("user_id", o.user_id)
        .maybeSingle();
      if (tok?.user_id) {
        calTokenUserId = o.user_id;
        break;
      }
    }
  }
  return calTokenUserId;
}
