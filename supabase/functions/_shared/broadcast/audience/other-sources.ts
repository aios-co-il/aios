// Campaigner, WhatsApp-group and manually typed sources.
import { buildTemplateVars } from "../template/template-vars.ts";
import { hasItems } from "./query.ts";
import type { AudienceDb, AudienceFilter, Recipient } from "./types.ts";

export async function resolveCampaigners(
  db: AudienceDb,
  tenantId: string,
  f: AudienceFilter,
): Promise<Recipient[]> {
  let q = db
    .from("campaigners")
    .select("id, full_name, phone, email, role, active")
    .eq("tenant_id", tenantId);
  if (f.activeOnly !== false) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  const roles = f.roles;
  return (data || [])
    .filter((c) =>
      hasItems(roles)
        ? (Array.isArray(c.role) ? c.role : []).some((r) => roles.includes(r))
        : true,
    )
    .map((c): Recipient => ({
      entity_type: "campaigner",
      entity_id: c.id,
      phone: c.phone || null,
      email: c.email || null,
      contact_name: c.full_name || null,
      vars: buildTemplateVars({
        contact_name: c.full_name,
        email: c.email,
        phone: c.phone,
      }),
    }));
}

export async function resolveWaGroups(
  db: AudienceDb,
  tenantId: string,
  f: AudienceFilter,
): Promise<Recipient[]> {
  if (!hasItems(f.groupIds)) throw new Error("missing_groupIds");
  const { data, error } = await db
    .from("whatsapp_groups")
    .select("id, group_name, group_chat_id")
    .eq("tenant_id", tenantId)
    .in("id", f.groupIds);
  if (error) throw error;
  return (data || []).map((g): Recipient => ({
    entity_type: "wa_group",
    entity_id: g.id,
    phone: null,
    email: null,
    contact_name: g.group_name || null,
    group_chat_id: g.group_chat_id || null,
    vars: buildTemplateVars({ contact_name: g.group_name }),
  }));
}

const MANUAL_EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * Typed contacts: an entry with "@" is an email (dropped when malformed),
 * anything else a phone (normalized later by reachability).
 */
export function resolveManualContacts(f: AudienceFilter): Recipient[] {
  return (f.manualContacts || [])
    .map((c) => String(c ?? "").trim())
    .filter((c) => c && (!c.includes("@") || MANUAL_EMAIL_RE.test(c)))
    .map((c): Recipient => {
      const email = c.includes("@") ? c.toLowerCase() : null;
      const phone = email ? null : c;
      return {
        entity_type: "manual",
        entity_id: null,
        phone,
        email,
        contact_name: null,
        vars: buildTemplateVars({ email, phone }),
      };
    });
}
