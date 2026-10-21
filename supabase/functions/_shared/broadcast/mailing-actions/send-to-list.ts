// send_template_to_list: create a broadcast for a list and enqueue it.
import type { DbClient } from "../../supabase-clients.ts";
import { loadList } from "./list-membership.ts";
import {
  broadcastFieldsFromTemplate,
  loadTemplate,
} from "./template-fields.ts";
import type { MailingActionContext } from "./types.ts";

export async function executeSendTemplateToList(
  db: DbClient,
  config: Record<string, unknown>,
  _data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
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
