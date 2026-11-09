import type { CallerPolicyRow } from "../_shared/carmen/caller-policy/policy.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../_shared/telephony/phone.ts";

/** The number that was dialled, and the org it belongs to. */
export type PhoneLine = { id: string; tenantId: string };

const LOG = "[carmen-phone]";

/** The active line for the dialled number, or null. */
export async function findPhoneLine(
  db: DbClient,
  calledNumber: string | null,
): Promise<PhoneLine | null> {
  const key = phoneMatchKey(calledNumber);
  if (!key) {
    return null;
  }
  const { data, error } = await db
    .from("carmen_phone_lines")
    .select("id, tenant_id")
    .eq("match_key", key)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error(`${LOG} phone line read failed`, error.message);
  }
  return data ? { id: data.id, tenantId: data.tenant_id } : null;
}

/** The org's display name. */
export async function orgName(db: DbClient, tenantId: string): Promise<string> {
  const { data, error } = await db
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    console.error(`${LOG} tenant name read failed`, error.message);
  }
  return data?.name || "הארגון";
}

/**
 * The org's caller policy rows. Throws on a failed read: the caller must not get a call set up
 * without the org's rules.
 */
export async function loadPolicyRows(
  db: DbClient,
  tenantId: string,
): Promise<Array<CallerPolicyRow>> {
  const { data, error } = await db
    .from("carmen_caller_policies")
    .select(
      "caller_kind, instructions, allowed_topics, forbidden_topics, may_take_message, may_book_meeting",
    )
    .eq("tenant_id", tenantId);
  if (error) {
    throw new Error(`caller policies unreadable: ${error.message}`);
  }
  return data ?? [];
}
