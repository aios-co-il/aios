import type { DbClient } from "../../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";

/** Who send_message writes to; phone is null when the contact is not found. */
export interface SendTarget {
  phone: string | null;
  contactName: string | null;
}

/**
 * The lead's or client's phone and name for send_message, looked up only
 * inside the caller's tenants. A malformed id finds nothing; a DB error
 * throws.
 */
export async function sendTargetFor(
  supabase: Pick<DbClient, "from">,
  contactType: unknown,
  contactId: unknown,
  tenantIds: string[],
): Promise<SendTarget> {
  const id = asUuidOrNull(contactId);
  if (!id) {
    return { phone: null, contactName: null };
  }

  return contactType === "lead"
    ? leadTarget(supabase, id, tenantIds)
    : clientTarget(supabase, id, tenantIds);
}

/** The lead's phone and contact or company name. */
async function leadTarget(
  supabase: Pick<DbClient, "from">,
  id: string,
  tenantIds: string[],
): Promise<SendTarget> {
  const { data, error } = await supabase
    .from("leads")
    .select("phone, company_name, contact_name")
    .eq("id", id)
    .in("tenant_id", tenantIds)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return {
    phone: data?.phone ?? null,
    contactName: (data?.contact_name || data?.company_name) ?? null,
  };
}

/** The client's phone and contact or client name. */
async function clientTarget(
  supabase: Pick<DbClient, "from">,
  id: string,
  tenantIds: string[],
): Promise<SendTarget> {
  const { data, error } = await supabase
    .from("clients")
    .select("phone, name, contact_name")
    .eq("id", id)
    .in("tenant_id", tenantIds)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return {
    phone: data?.phone ?? null,
    contactName: (data?.contact_name || data?.name) ?? null,
  };
}
