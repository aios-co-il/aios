// send_template_to_list: create a broadcast for a list and enqueue it.
import type { DbClient } from "../../supabase-clients.ts";
import { loadList } from "./list-membership.ts";
import {
  broadcastFieldsFromTemplate,
  loadTemplate,
} from "./template-fields.ts";
import { isTestRun, type MailingActionContext } from "./types.ts";

export async function executeSendTemplateToList(
  db: DbClient,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  // A test run must not reserve the interval or send to the whole list.
  if (isTestRun(data)) return { success: true, skipped: "test_run" };
  const template = await loadTemplate(db, tenantId, config.template_id);
  const list = await loadList(db, tenantId, config.list_id);
  const stepKey = `list:${template.id}:${list.id}`;

  // Reserve the send atomically: concurrent triggers serialize in the
  // database, so a trigger burst cannot send the whole list twice.
  const hours = Math.max(0, Number(config.min_interval_hours ?? 24) || 0);
  const fields = await broadcastFieldsFromTemplate(
    db,
    tenantId,
    template,
    config,
    ctx,
  );
  const name = `אוטומציה · ${template.name} → ${list.name}`;
  const { data: reservation, error: reserveError } = await db
    .rpc("broadcast_reserve_automation_send", {
      p_tenant_id: tenantId,
      p_automation_id: ctx.automationId,
      p_step_key: stepKey,
      p_min_interval_hours: hours,
      p_name: name,
      p_channel: fields.channel ?? template.channel,
      p_provider: fields.provider,
    })
    .single();
  if (reserveError) throw reserveError;
  if (!reservation.reserved)
    return {
      success: true,
      skipped: "sent_recently",
      broadcast_id: reservation.broadcast_id,
    };

  const created = { id: reservation.broadcast_id };
  const { error } = await db
    .from("broadcasts")
    .update({
      ...fields,
      name,
      audience_filter: { source: "list", listId: list.id },
      status: "draft",
    })
    .eq("id", created.id);
  if (error) throw error;

  let total: number;
  try {
    total = (await ctx.enqueue(created.id)).total;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("broadcasts")
      .update({ status: "failed", last_error: message })
      .eq("id", created.id);
    throw e;
  }
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
