// Which lead / client / contact an automation trigger is about.
import type { DbClient } from "../../supabase-clients.ts";
import { recipientForEntity } from "../audience/records.ts";
import type { Recipient } from "../audience/types.ts";
import { buildTemplateVars } from "../template/template-vars.ts";
import { str } from "./types.ts";

/** Which lead / client the trigger is about. */
export function resolveTargetEntity(
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  triggerType?: string | null,
): { type: "lead" | "client"; id: string } | null {
  const wanted = str(config.entity) ?? "auto";
  const leadId = str(data.lead_id);
  const clientId = str(data.client_id);
  const id = str(data.id);
  if (wanted === "lead") {
    const v = leadId ?? (triggerType?.startsWith("client_") ? null : id);
    return v ? { type: "lead", id: v } : null;
  }
  if (wanted === "client") {
    const v = clientId ?? (triggerType?.startsWith("client_") ? id : null);
    return v ? { type: "client", id: v } : null;
  }
  if (triggerType?.startsWith("client_")) {
    const v = clientId ?? id;
    return v ? { type: "client", id: v } : null;
  }
  const v = leadId ?? id;
  if (v) return { type: "lead", id: v };
  return clientId ? { type: "client", id: clientId } : null;
}

/** The trigger's contact: CRM record when found, else the payload's own fields. */
export async function contactFromTrigger(
  db: DbClient,
  tenantId: string,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  triggerType?: string | null,
): Promise<Recipient | null> {
  const target = resolveTargetEntity(config, data, triggerType);
  if (target) {
    const r = await recipientForEntity(db, tenantId, target.type, target.id);
    if (r) return r;
  }
  const phone = str(data.phone);
  const email = str(data.email);
  if (!phone && !email) return null;
  const name =
    str(data.contact_name) ?? str(data.name) ?? str(data.company_name);
  return {
    entity_type: "manual",
    entity_id: null,
    phone,
    email,
    contact_name: name,
    vars: buildTemplateVars({
      contact_name: name,
      company_name: str(data.company_name),
      email,
      phone,
    }),
  };
}
