// Static list source: list members, enriched with their lead/client data.
import type { DbClient } from "../../supabase-clients.ts";
import { buildTemplateVars } from "../template/template-vars.ts";
import { loadLookups } from "./lookups.ts";
import { fetchAll, fetchByIds, flatObject } from "./query.ts";
import {
  CLIENT_COLUMNS,
  clientRecipient,
  LEAD_COLUMNS,
  leadRecipient,
} from "./records.ts";
import type { Recipient } from "./types.ts";

/** Static list members, enriched with their lead/client data when linked. */
export async function resolveStaticList(
  db: DbClient,
  tenantId: string,
  listId: string,
): Promise<Recipient[]> {
  const members = await fetchAll(() =>
    db
      .from("broadcast_list_members")
      .select("entity_type, entity_id, name, phone, email, custom_fields")
      .eq("tenant_id", tenantId)
      .eq("list_id", listId)
      .order("created_at", { ascending: true }),
  );
  const idsOf = (type: string) =>
    members
      .filter((m) => m.entity_type === type && m.entity_id)
      .map((m) => m.entity_id);
  const leadIds = idsOf("lead");
  const clientIds = idsOf("client");
  const [leads, clients] = await Promise.all([
    fetchByIds(leadIds, (chunk) =>
      db.from("leads").select(LEAD_COLUMNS).in("id", chunk),
    ),
    fetchByIds(clientIds, (chunk) =>
      db.from("clients").select(CLIENT_COLUMNS).in("id", chunk),
    ),
  ]);
  const lk = await loadLookups(
    db,
    tenantId,
    clientIds.filter((id): id is string => !!id),
  );
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return members.map((m): Recipient => {
    const custom = flatObject(m.custom_fields);
    const id = m.entity_id;
    const lead = id && m.entity_type === "lead" ? leadMap.get(id) : null;
    const client = id && m.entity_type === "client" ? clientMap.get(id) : null;
    // The list row's phone/email win: that is the address the member was added with.
    const base = lead
      ? leadRecipient(lead, lk, custom)
      : client
        ? clientRecipient(client, lk, custom)
        : null;
    const contact = m.name || base?.contact_name || null;
    return {
      entity_type: (m.entity_type || "manual") as Recipient["entity_type"],
      entity_id: m.entity_id || null,
      phone: m.phone || base?.phone || null,
      email: m.email || base?.email || null,
      contact_name: contact,
      vars: {
        ...(base?.vars ||
          buildTemplateVars({
            contact_name: contact,
            email: m.email,
            phone: m.phone,
            extra: custom,
          })),
        ...(m.phone ? { phone: m.phone } : {}),
        ...(m.email ? { email: m.email } : {}),
      },
    };
  });
}
