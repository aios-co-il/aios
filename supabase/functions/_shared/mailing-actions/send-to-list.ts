// send_template_to_list: create a broadcast for a list and enqueue it.
import { loadList } from "./list-membership.ts";
import {
  broadcastFieldsFromTemplate,
  loadTemplate,
} from "./template-fields.ts";
import type { Db, MailingActionContext } from "./types.ts";

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
