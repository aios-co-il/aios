// broadcast-unsubscribe — the unsubscribe link at the end of every mailing
// (email footer, WhatsApp last line, List-Unsubscribe header). Routing lives
// in handler.ts; this file wires it to the database.
//
// Unsubscribing adds the recipient's phone and email to its tenant's mailing
// blacklist (broadcast_opt_outs, channel 'all'), so mailings skip them on
// WhatsApp and email, and marks the recipient opted_out.
//
// Public (verify_jwt = false in config.toml). The recipient id is the only
// credential: every write is scoped to that recipient's own tenant.
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import {
  addToBlacklist,
  unsubscribeAddresses,
  type UnsubscribeRecipient,
} from "../_shared/broadcast/blacklist.ts";
import { appOrigin } from "../_shared/carmen/skin-gallery.ts";
import { handleUnsubscribe, type UnsubscribeStore } from "./handler.ts";

// Per-environment app origin (APP_URL); production when unset.
const APP_URL = appOrigin(null, Deno.env.get("APP_URL"));

const store = supabaseStore(serviceClient());

Deno.serve((req) => handleUnsubscribe(req, { store, appUrl: APP_URL }));

/** The broadcast recipient with this id, in any tenant (the id is the credential). */
async function findRecipient(db: DbClient, id: string) {
  const { data, error } = await db
    .from("broadcast_recipients")
    .select("id, tenant_id, entity_type, entity_id, phone, email, vars")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

/** The recipient's tenant name and slug; a missing tenant is a data error. */
async function findTenant(db: DbClient, tenantId: string) {
  const { data, error } = await db
    .from("tenants")
    .select("name, slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(`tenant ${tenantId} not found for recipient`);
  }
  return data;
}

/** The recipient's addresses plus the CRM record's current ones. */
async function addressesOf(
  db: DbClient,
  r: UnsubscribeRecipient & { tenant_id: string; entity_id: string | null },
) {
  let crm: { phone: string | null; email: string | null } | null = null;
  if (r.entity_id && (r.entity_type === "lead" || r.entity_type === "client")) {
    const { data, error } = await db
      .from(r.entity_type === "lead" ? "leads" : "clients")
      .select("phone, email")
      .eq("id", r.entity_id)
      .eq("tenant_id", r.tenant_id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    crm = data;
  }
  return unsubscribeAddresses(r, crm);
}

/** Supabase-backed store; every write is keyed to the recipient's tenant. */
function supabaseStore(db: DbClient): UnsubscribeStore {
  return {
    async tenantOf(id) {
      const r = await findRecipient(db, id);
      return r ? await findTenant(db, r.tenant_id) : null;
    },
    async unsubscribe(id) {
      const r = await findRecipient(db, id);
      if (!r) {
        return null;
      }
      const tenant = await findTenant(db, r.tenant_id);
      await addToBlacklist(
        db,
        r.tenant_id,
        await addressesOf(db, r),
        "unsubscribe_link",
      );
      const { error } = await db
        .from("broadcast_recipients")
        .update({ status: "opted_out" })
        .eq("id", r.id)
        .eq("tenant_id", r.tenant_id);
      if (error) {
        throw error;
      }
      return { tenantName: tenant.name };
    },
  };
}
