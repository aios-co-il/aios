// Mailing-list and template actions for the automation engine
// (trigger-automation). All sends go through the broadcast pipeline so
// throttling, opt-outs, unsubscribe links and stats work the same as a
// manual broadcast.
//
//   add_to_mailing_list       { list_id, entity? }
//   remove_from_mailing_list  { list_id, entity? }
//   send_template_to_contact  { template_id, entity?, integration_id?, sender_domain_id?, from_mode?, from_local?, from_name? }
//   send_template_to_list     { template_id, list_id, min_interval_hours?, integration_id?, sender_domain_id?, ... }
//   sync_mailing_list         { list_id } — adds the trigger's lead/client when it
//                             matches the list's CRM filter, removes it when not
//
// entity: 'auto' (default) | 'lead' | 'client'.
import {
  type AudienceFilter,
  type Recipient,
  entityMatchesFilter,
  isOptedOut,
  recipientForEntity,
} from "./broadcast-audience.ts";
import { buildTemplateVars, normalizePhone } from "./broadcast-template.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export const MAILING_ACTION_TYPES = [
  "add_to_mailing_list",
  "remove_from_mailing_list",
  "send_template_to_contact",
  "send_template_to_list",
  "sync_mailing_list",
] as const;
export type MailingActionType = (typeof MAILING_ACTION_TYPES)[number];

export type MailingActionContext = {
  automationId: string;
  triggerType?: string | null;
  /** Owner fallback for WhatsApp sends when the integration has no user. */
  resolveOwnerId: (db: Db, tenantId: string) => Promise<string>;
  /** Sender address for email sends (broadcast_email_domains). */
  resolveEmailFrom: (
    db: Db,
    config: Record<string, unknown>,
    tenantId: string,
  ) => Promise<{ fromEmail: string; fromName: string | null }>;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

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
async function contactFromTrigger(
  db: Db,
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

async function loadList(db: Db, tenantId: string, listId: unknown) {
  if (!str(listId)) throw new Error("לא נבחרה רשימת דיוור");
  const { data, error } = await db
    .from("broadcast_lists")
    .select("id, name, kind, source")
    .eq("tenant_id", tenantId)
    .eq("id", listId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("רשימת הדיוור לא נמצאה");
  return data;
}

export async function executeAddToMailingList(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const list = await loadList(db, tenantId, config.list_id);
  if (list.kind === "dynamic")
    throw new Error("רשימה דינמית מתעדכנת לבד לפי הסינון – בחר רשימה קבועה");
  const contact = await contactFromTrigger(
    db,
    tenantId,
    config,
    data,
    ctx.triggerType,
  );
  if (!contact) throw new Error("לא נמצא איש קשר עם טלפון או אימייל");
  const phone = normalizePhone(contact.phone);
  const email = contact.email ? contact.email.toLowerCase() : null;
  if (!phone && !email) throw new Error("לאיש הקשר אין טלפון או אימייל");

  const { data: added, error } = await db.rpc("broadcast_list_add_members", {
    p_list_id: list.id,
    p_rows: [
      {
        entity_type: contact.entity_type,
        entity_id: contact.entity_id,
        name: contact.contact_name,
        phone,
        email,
      },
    ],
    p_added_via: "automation",
  });
  if (error) throw error;
  return {
    success: true,
    list_id: list.id,
    list_name: list.name,
    added: Number(added || 0),
  };
}

export async function executeRemoveFromMailingList(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const list = await loadList(db, tenantId, config.list_id);
  if (list.kind === "dynamic")
    throw new Error("רשימה דינמית מתעדכנת לבד לפי הסינון – בחר רשימה קבועה");
  const target = resolveTargetEntity(config, data, ctx.triggerType);
  const contact = await contactFromTrigger(
    db,
    tenantId,
    config,
    data,
    ctx.triggerType,
  );
  const phone = normalizePhone(contact?.phone);
  const email = contact?.email ? contact.email.toLowerCase() : null;

  const ors: string[] = [];
  if (target) ors.push(`entity_id.eq.${target.id}`);
  if (phone) ors.push(`phone.eq.${phone}`);
  if (email) ors.push(`email.eq.${email}`);
  if (ors.length === 0) throw new Error("לא נמצא איש קשר להסרה");

  const { data: removed, error } = await db
    .from("broadcast_list_members")
    .delete()
    .eq("list_id", list.id)
    .or(ors.join(","))
    .select("id");
  if (error) throw error;
  return { success: true, list_id: list.id, removed: (removed || []).length };
}

async function loadTemplate(db: Db, tenantId: string, templateId: unknown) {
  if (!str(templateId)) throw new Error("לא נבחר טמפלייט");
  const { data, error } = await db
    .from("message_templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("הטמפלייט לא נמצא");
  return data;
}

/** Broadcast columns for a template + channel sender. */
async function broadcastFieldsFromTemplate(
  db: Db,
  tenantId: string,
  template: Db,
  config: Record<string, unknown>,
  ctx: MailingActionContext,
) {
  const common = {
    tenant_id: tenantId,
    channel: template.channel,
    template_id: template.id,
    subject: template.subject,
    body_text: template.body_text,
    body_html: template.channel === "email" ? template.body_html : null,
    html_mode: template.channel === "email" && !!template.html_mode,
    media_url: template.channel === "whatsapp" ? template.media_url : null,
    origin: "automation",
    automation_id: ctx.automationId,
  };
  if (template.channel === "email") {
    const from = await ctx.resolveEmailFrom(db, config, tenantId);
    return {
      ...common,
      provider: "resend",
      integration_id: null,
      from_email: from.fromEmail,
      from_name: from.fromName,
      reply_to: str(config.reply_to),
      created_by: await ctx.resolveOwnerId(db, tenantId),
    };
  }
  let q = db
    .from("tenant_integrations")
    .select("id, user_id, integration_type")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("integration_type", ["green_api", "manus_wa"]);
  q = str(config.integration_id)
    ? q.eq("id", config.integration_id)
    : q.limit(1);
  const { data: integ } = await q.maybeSingle();
  if (!integ) throw new Error("לא נמצא חיבור WhatsApp פעיל לשליחה");
  return {
    ...common,
    provider: integ.integration_type === "manus_wa" ? "manus_wa" : "green_api",
    integration_id: integ.id,
    created_by: integ.user_id || (await ctx.resolveOwnerId(db, tenantId)),
  };
}

export async function executeSendTemplateToContact(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const template = await loadTemplate(db, tenantId, config.template_id);
  const channel: string = template.channel;
  const contact = await contactFromTrigger(
    db,
    tenantId,
    config,
    data,
    ctx.triggerType,
  );
  if (!contact) throw new Error("לא נמצא איש קשר לשליחה");

  const phone = channel === "email" ? null : normalizePhone(contact.phone);
  const email =
    channel === "email"
      ? (contact.email || "").toLowerCase() || null
      : contact.email;
  if (channel === "email" ? !email : !phone)
    return {
      success: true,
      skipped: channel === "email" ? "no_email" : "no_phone",
    };
  if (await isOptedOut(db, tenantId, channel, { phone, email }))
    return { success: true, skipped: "opted_out" };

  // One long-lived stream per automation + template; dispatch sends its
  // pending rows and never marks it complete.
  const stepKey = `contact:${template.id}`;
  const fields = await broadcastFieldsFromTemplate(
    db,
    tenantId,
    template,
    config,
    ctx,
  );
  const { data: existing } = await db
    .from("broadcasts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("origin", "automation")
    .eq("automation_id", ctx.automationId)
    .eq("automation_step_key", stepKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let broadcastId: string;
  if (existing) {
    broadcastId = existing.id;
    // Keep the stream on the template's latest content and sender.
    const { error } = await db
      .from("broadcasts")
      .update({ ...fields, status: "sending" })
      .eq("id", broadcastId);
    if (error) throw error;
  } else {
    const { data: created, error } = await db
      .from("broadcasts")
      .insert({
        ...fields,
        name: `אוטומציה · ${template.name}`,
        automation_step_key: stepKey,
        audience_filter: {},
        status: "sending",
        started_at: new Date().toISOString(),
        scheduled_at: new Date().toISOString(),
        daily_cap: 1000,
      })
      .select("id")
      .single();
    if (error) throw error;
    broadcastId = created.id;
  }

  const { error: insErr } = await db.from("broadcast_recipients").insert({
    broadcast_id: broadcastId,
    tenant_id: tenantId,
    entity_type: contact.entity_type,
    entity_id: contact.entity_id,
    phone,
    email,
    contact_name: contact.contact_name,
    vars: contact.vars,
    status: "pending",
  });
  if (insErr) {
    // Unique (broadcast, phone|email): this contact already got this template.
    if (String(insErr.code) === "23505" || /duplicate/i.test(insErr.message))
      return {
        success: true,
        skipped: "already_sent",
        broadcast_id: broadcastId,
      };
    throw insErr;
  }
  return { success: true, queued: true, broadcast_id: broadcastId, channel };
}

export async function executeSendTemplateToList(
  db: Db,
  config: Record<string, unknown>,
  _data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const template = await loadTemplate(db, tenantId, config.template_id);
  const list = await loadList(db, tenantId, config.list_id);
  const stepKey = `list:${template.id}:${list.id}`;

  // Guard against a trigger flood sending the whole list again and again.
  const hours = Math.max(0, Number(config.min_interval_hours ?? 24) || 0);
  if (hours > 0) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data: recent } = await db
      .from("broadcasts")
      .select("id, created_at")
      .eq("tenant_id", tenantId)
      .eq("origin", "automation")
      .eq("automation_id", ctx.automationId)
      .eq("automation_step_key", stepKey)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (recent)
      return {
        success: true,
        skipped: "sent_recently",
        broadcast_id: recent.id,
      };
  }

  const fields = await broadcastFieldsFromTemplate(
    db,
    tenantId,
    template,
    config,
    ctx,
  );
  const { data: created, error } = await db
    .from("broadcasts")
    .insert({
      ...fields,
      name: `אוטומציה · ${template.name} → ${list.name}`,
      automation_step_key: stepKey,
      audience_filter: { source: "list", listId: list.id },
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${SB_URL}/functions/v1/broadcast-enqueue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_SERVICE}`,
      apikey: SB_SERVICE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ broadcastId: created.id }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    await db
      .from("broadcasts")
      .update({
        status: "failed",
        last_error: String(result?.error || res.status),
      })
      .eq("id", created.id);
    throw new Error(`broadcast-enqueue failed: ${result?.error || res.status}`);
  }
  const total = Number(result?.total || 0);
  const now = new Date().toISOString();
  await db
    .from("broadcasts")
    .update(
      total > 0
        ? { status: "sending", started_at: now, scheduled_at: now }
        : { status: "canceled", last_error: "אין נמענים תקינים ברשימה" },
    )
    .eq("id", created.id);
  return { success: true, broadcast_id: created.id, recipients: total };
}

export async function executeSyncMailingList(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  if (!str(config.list_id)) throw new Error("לא נבחרה רשימת דיוור");
  const { data: list, error } = await db
    .from("broadcast_lists")
    .select("id, name, kind, source, source_config")
    .eq("tenant_id", tenantId)
    .eq("id", config.list_id)
    .maybeSingle();
  if (error) throw error;
  if (!list) throw new Error("רשימת הדיוור לא נמצאה");
  const filter = list.source_config as AudienceFilter | null;
  if (list.source !== "crm_filter" || !filter?.source)
    throw new Error("סנכרון זמין רק לרשימה שנוצרה מסינון CRM");
  if (list.kind === "dynamic")
    return { success: true, skipped: "dynamic_list_updates_itself" };

  const target = resolveTargetEntity(
    { entity: filter.source === "clients" ? "client" : "lead" },
    data,
    ctx.triggerType,
  );
  if (!target) return { success: true, skipped: "no_matching_entity" };

  const matches = await entityMatchesFilter(
    db,
    tenantId,
    filter,
    target.type,
    target.id,
  );
  if (!matches) {
    const { data: removed, error: delErr } = await db
      .from("broadcast_list_members")
      .delete()
      .eq("list_id", list.id)
      .eq("entity_id", target.id)
      .select("id");
    if (delErr) throw delErr;
    return {
      success: true,
      action: "removed",
      list_id: list.id,
      removed: (removed || []).length,
    };
  }

  const contact = await recipientForEntity(
    db,
    tenantId,
    target.type,
    target.id,
  );
  const phone = normalizePhone(contact?.phone);
  const email = contact?.email ? contact.email.toLowerCase() : null;
  if (!contact || (!phone && !email))
    return { success: true, skipped: "no_phone_or_email" };
  const { data: added, error: addErr } = await db.rpc(
    "broadcast_list_add_members",
    {
      p_list_id: list.id,
      p_rows: [
        {
          entity_type: target.type,
          entity_id: target.id,
          name: contact.contact_name,
          phone,
          email,
        },
      ],
      p_added_via: "automation",
    },
  );
  if (addErr) throw addErr;
  return {
    success: true,
    action: "added",
    list_id: list.id,
    added: Number(added || 0),
  };
}

export async function executeMailingAction(
  actionType: MailingActionType,
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  switch (actionType) {
    case "add_to_mailing_list":
      return executeAddToMailingList(db, config, data, tenantId, ctx);
    case "remove_from_mailing_list":
      return executeRemoveFromMailingList(db, config, data, tenantId, ctx);
    case "send_template_to_contact":
      return executeSendTemplateToContact(db, config, data, tenantId, ctx);
    case "send_template_to_list":
      return executeSendTemplateToList(db, config, data, tenantId, ctx);
    case "sync_mailing_list":
      return executeSyncMailingList(db, config, data, tenantId, ctx);
  }
}
