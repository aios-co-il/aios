import {
  leadPhoneVariants,
  pickDuplicateLead,
} from "./lead-duplicate-match.ts";

/** The slice of the Supabase client these helpers use, so tests can fake it. */
export type LeadDb = { from: (table: string) => any };

type InboundContact = { phone?: string | null; email?: string | null };

/** Pipeline stages a returning lead stays in: the deal is already decided. */
const FINAL_LEAD_STATUSES = new Set([
  "closed",
  "won",
  "lost",
  "transferred_to_onboarding",
]);

/**
 * Find the lead this inbound contact returns to: same phone and no
 * conflicting email (see lead-duplicate-match.ts).
 */
export async function getExistingLead(
  db: LeadDb,
  tenantId: string | null,
  incoming: InboundContact,
) {
  const phoneVariants = leadPhoneVariants(incoming.phone);
  if (phoneVariants.length === 0) return null;

  const { data: leadsByPhone } = await db
    .from("leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(20);

  const match = pickDuplicateLead(leadsByPhone, incoming);
  if (match) return match;

  // Stored phones may use other spellings; scan recent leads as a fallback
  const { data: recentLeads } = await db
    .from("leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  return pickDuplicateLead(recentLeads, incoming);
}

/**
 * A returning lead goes back to the "new" column, unless its deal is already
 * decided (a final stage, a won date, or a linked client).
 */
export function returningLeadStatusUpdate(existing: {
  status?: string | null;
  won_date?: string | null;
  client_id?: string | null;
}): { status?: "new" } {
  const decided =
    FINAL_LEAD_STATUSES.has(existing.status ?? "") ||
    Boolean(existing.won_date) ||
    Boolean(existing.client_id);
  return decided ? {} : { status: "new" };
}

/** Find or create a tenant tag and attach it to the lead (idempotent). */
export async function applyTagToLead(
  db: LeadDb,
  tenantId: string,
  leadId: string,
  rawTagName: string,
): Promise<void> {
  const tagName = rawTagName.trim();
  if (!tagName) return;

  // Look up first: an upsert would reset the color of an existing tag
  const { data: existingTag } = await db
    .from("chat_tags")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", tagName)
    .maybeSingle();

  let tagId = existingTag?.id;
  if (!tagId) {
    const { data: newTag } = await db
      .from("chat_tags")
      .insert({ tenant_id: tenantId, name: tagName, color: "#3b82f6" })
      .select("id")
      .single();
    tagId = newTag?.id;
  }
  if (!tagId) return;

  await db.from("chat_contact_tags").upsert(
    {
      tenant_id: tenantId,
      tag_id: tagId,
      lead_id: leadId,
      user_id: "00000000-0000-0000-0000-000000000000",
    },
    { onConflict: "tag_id,lead_id", ignoreDuplicates: true },
  );
}
