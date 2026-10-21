// send_template_to_contact: queue one recipient on a long-lived broadcast.
import type { DbClient } from "../../supabase-clients.ts";
import { isOptedOut } from "../audience/reachability.ts";
import { normalizePhone } from "../template/template-vars.ts";
import { contactFromTrigger } from "./target.ts";
import {
  broadcastFieldsFromTemplate,
  loadTemplate,
} from "./template-fields.ts";
import type { MailingActionContext } from "./types.ts";

export async function executeSendTemplateToContact(
  db: DbClient,
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
