// Channel reachability, address dedupe and opt-outs.
import { normalizePhone } from "../template/template-vars.ts";
import { fetchAll } from "./query.ts";
import type { AudienceDb, Recipient } from "./types.ts";

/**
 * Keep recipients reachable on the channel, normalize + dedupe addresses and
 * drop opt-outs. Email recipients are returned without phone (the phone stays
 * in vars) so the per-broadcast email unique index applies.
 */
export async function filterReachable(
  db: AudienceDb,
  tenantId: string,
  channel: string,
  recipients: Recipient[],
): Promise<Recipient[]> {
  const seen = new Set<string>();
  const deduped: Recipient[] = [];
  for (const r of recipients) {
    if (r.entity_type === "wa_group") {
      const key = `g:${r.group_chat_id || r.entity_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
      continue;
    }
    if (channel === "email") {
      const email = (r.email || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      deduped.push({ ...r, email, phone: null });
    } else {
      const phone = normalizePhone(r.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      deduped.push({ ...r, phone });
    }
  }

  const optOuts = await fetchAll(() =>
    db
      .from("broadcast_opt_outs")
      .select("phone, email, channel")
      .eq("tenant_id", tenantId)
      .in("channel", [channel, "all"]),
  );
  const optPhones = new Set(optOuts.map((o) => o.phone).filter(Boolean));
  const optEmails = new Set(
    optOuts.map((o) => (o.email || "").toLowerCase()).filter(Boolean),
  );
  return deduped.filter((r) => {
    if (r.entity_type === "wa_group") return true;
    return channel === "email"
      ? !optEmails.has(r.email || "")
      : !optPhones.has(r.phone || "");
  });
}

/** Is this address opted out on the channel? Used for single sends. */
export async function isOptedOut(
  db: AudienceDb,
  tenantId: string,
  channel: string,
  address: { phone?: string | null; email?: string | null },
): Promise<boolean> {
  let q = db
    .from("broadcast_opt_outs")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("channel", [channel, "all"])
    .limit(1);
  if (channel === "email") {
    if (!address.email) return false;
    q = q.eq("email", address.email.toLowerCase());
  } else {
    const phone = normalizePhone(address.phone);
    if (!phone) return false;
    q = q.eq("phone", phone);
  }
  const { data } = await q;
  return (data || []).length > 0;
}
