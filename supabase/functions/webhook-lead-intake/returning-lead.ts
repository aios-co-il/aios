import {
  leadPhoneVariants,
  pickDuplicateLead,
} from "./lead-duplicate-match.ts";
import type { Tables } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

type LeadRow = Tables<"leads">;
type IdRow = { id: string };
type Rows<Lead> = PromiseLike<{ data: Lead[] | null }>;

/** The two lead queries behind `getExistingLead`, newest first. */
export interface LeadLookup<Lead> {
  byPhones(tenantId: string, phones: string[]): Rows<Lead>;
  recentWithPhone(tenantId: string): Rows<Lead>;
}

export const leadLookup = (db: DbClient): LeadLookup<LeadRow> => ({
  byPhones: (tenantId, phones) =>
    db
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("phone", phones)
      .order("created_at", { ascending: false })
      .limit(20),
  recentWithPhone: (tenantId) =>
    db
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .not("phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
});

type TagKey = { tenant_id: string; name: string };
type ContactTag = {
  tenant_id: string;
  tag_id: string;
  lead_id: string;
  user_id: string;
};

/** Only the builder calls `applyTagToLead` makes; the Supabase client satisfies it. */
export interface TagDb {
  from(table: "chat_tags"): {
    select(columns: "id"): {
      match(filter: TagKey): {
        maybeSingle(): PromiseLike<{ data: IdRow | null }>;
      };
    };
    insert(values: TagKey & { color: string }): {
      select(columns: "id"): { single(): PromiseLike<{ data: IdRow | null }> };
    };
  };
  from(table: "chat_contact_tags"): {
    upsert(
      values: ContactTag,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): PromiseLike<unknown>;
  };
}

type InboundContact = { phone?: string | null; email?: string | null };

/** Pipeline stages a returning lead stays in: the deal is already decided. */
const FINAL_LEAD_STATUSES = new Set([
  "closed",
  "won",
  "lost",
  "transferred_to_onboarding",
]);

/**
 * Find the lead this inbound contact returns to: same phone and same email
 * (see lead-duplicate-match.ts).
 */
export async function getExistingLead<Lead extends InboundContact>(
  leads: LeadLookup<Lead>,
  tenantId: string | null,
  incoming: InboundContact,
): Promise<Lead | null> {
  const phoneVariants = leadPhoneVariants(incoming.phone);
  if (phoneVariants.length === 0 || !tenantId) return null;

  const { data: leadsByPhone } = await leads.byPhones(tenantId, phoneVariants);
  const match = pickDuplicateLead(leadsByPhone, incoming);
  if (match) return match;

  // Stored phones may use other spellings; scan recent leads as a fallback
  const { data: recentLeads } = await leads.recentWithPhone(tenantId);
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
  db: TagDb,
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
    .match({ tenant_id: tenantId, name: tagName })
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
