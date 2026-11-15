// Mailing blacklist: the unsubscribe link and the addresses it blocks.
// Entries live in broadcast_opt_outs with channel 'all', so mailings skip the
// contact on WhatsApp and on email (see audience/reachability.ts). Chats and
// manual sends are not affected.
import { normalizePhone } from "./template/template-vars.ts";

/**
 * The unsubscribe page in the app for one broadcast recipient: the email
 * footer, the WhatsApp last line and the page a link from an old mailing
 * redirects to. The function domain serves HTML as text/plain, so people
 * are sent to the app.
 */
export function unsubscribeUrl(
  appUrl: string,
  tenantSlug: string,
  recipientId: string,
) {
  return `${appUrl}/unsubscribe/${encodeURIComponent(tenantSlug)}?r=${recipientId}`;
}

/**
 * The function address mail clients POST to for one-click unsubscribe
 * (List-Unsubscribe-Post); server to server, so no page is needed.
 */
export function oneClickUnsubscribeUrl(
  supabaseUrl: string,
  recipientId: string,
) {
  return `${supabaseUrl}/functions/v1/broadcast-unsubscribe?r=${recipientId}`;
}

/** List-Unsubscribe value: the one-click address first, then the page. */
export function listUnsubscribeHeader(oneClickUrl: string, pageUrl: string) {
  return `<${oneClickUrl}>, <${pageUrl}>`;
}

/** Last lines of every WhatsApp mailing to a contact. */
export function whatsappUnsubscribeFooter(url: string) {
  return `\n\nלהסרה מרשימת הדיוור: ${url}`;
}

/** What adding needs from a Supabase client (edge or browser). */
export type BlacklistDb = {
  from(table: "broadcast_opt_outs"): {
    insert(row: ReturnType<typeof blacklistRows>[number]): PromiseLike<{
      error: { code?: string; message: string } | null;
    }>;
  };
};

export type BlockAddresses = {
  phones: (string | null | undefined)[];
  emails: (string | null | undefined)[];
};

/** The parts of a broadcast recipient the unsubscribe link reads. */
export type UnsubscribeRecipient = {
  entity_type: string;
  phone: string | null;
  email: string | null;
  vars: unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Addresses to block when a recipient unsubscribes: the recipient's own
 * phone and email, the snapshot in vars (email recipients are stored without
 * a phone) and the CRM record's current phone and email. A WhatsApp group's
 * "phone" is its chat id, so it is never blocked.
 */
export function unsubscribeAddresses(
  r: UnsubscribeRecipient,
  crm: { phone: string | null; email: string | null } | null,
): BlockAddresses {
  const vars = isRecord(r.vars) ? r.vars : {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const phones =
    r.entity_type === "wa_group" ? [] : [r.phone, str(vars.phone), crm?.phone];
  return { phones, emails: [r.email, str(vars.email), crm?.email] };
}

/** Normalized, de-duplicated phones and emails to block. */
export function blacklistRows(
  tenantId: string,
  { phones, emails }: BlockAddresses,
  source: string,
) {
  const phoneSet = new Set(
    phones.map((p) => normalizePhone(p)).filter((p): p is string => !!p),
  );
  const emailSet = new Set(
    emails
      .map((e) => (e || "").trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
  return [
    ...[...phoneSet].map((phone) => ({
      tenant_id: tenantId,
      phone,
      email: null,
      channel: "all",
      source,
    })),
    ...[...emailSet].map((email) => ({
      tenant_id: tenantId,
      phone: null,
      email,
      channel: "all",
      source,
    })),
  ];
}

/**
 * Add the addresses to the tenant's blacklist. An address that is already
 * blocked is left as is (unique-violation is ignored). Returns how many
 * addresses were asked for.
 */
export async function addToBlacklist(
  db: BlacklistDb,
  tenantId: string,
  addresses: BlockAddresses,
  source: string,
): Promise<number> {
  const rows = blacklistRows(tenantId, addresses, source);
  for (const row of rows) {
    const { error } = await db.from("broadcast_opt_outs").insert(row);
    if (error && error.code !== "23505") throw error;
  }
  return rows.length;
}
