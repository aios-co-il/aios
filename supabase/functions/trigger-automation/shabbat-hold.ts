/**
 * Shabbat hold for task WhatsApp notifications (AIO-226), for the window in
 * _shared/shabbat/quiet-window.ts. Worker-driven notifications (assignment,
 * reminders, overdue, completion, self reminder) are not claimed in the
 * window, so their task markers stay NULL and the worker's next run after it
 * sends them. Peer notifications come straight from the app, so they are
 * stored in task_notification_holds and the worker replays each once with the
 * service role (task-notification-worker/release-held.ts).
 */
import type { DirectRunDecision } from "../_shared/automation-run-auth.ts";
import type { HeldPeerNotification } from "../_shared/shabbat/held-peer-notification.ts";
import { jerusalemShabbatHoldUntil } from "../_shared/shabbat/quiet-window.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { taskUpdateEventKey } from "../_shared/task-notification-dedupe.ts";
import { holdTenantId } from "./shabbat-hold-tenant.ts";

/** Task notifications the app sends itself; held ones are queued for replay. */
const PEER_TASK_NOTIFICATION_TYPES = new Set([
  "task_collaborator_added",
  "task_update_added",
]);

type ShabbatHoldResponse = {
  handled: true;
  sent: false;
  held: true;
  reason: "shabbat_quiet_hours";
  hold_until: string;
  queued?: boolean;
  /** Why a peer notification was not queued. */
  not_queued?: "task_not_found" | "queue_failed";
  task_id?: string;
  notification_type?: string;
};

type ShabbatHoldResult =
  | { status: 202; body: ShabbatHoldResponse }
  | { status: 400 | 401 | 403; body: { error: string; queued: false } };

/**
 * trigger-automation front door. Returns null outside the window. Inside it,
 * nothing is sent: worker-driven types answer sent:false so the worker
 * releases its marker and retries after the window; peer types are queued.
 *
 * The worker replays a queued peer notification with the service role, and a
 * replay that Carmen cannot route falls through to the generic automations of
 * its tenant_id. So before queuing, the caller must pass `authorizeTenant`
 * for the body's tenant_id (the generic path's check), and that tenant must be
 * one the task belongs to; the stored tenant_id always comes from the task.
 */
export async function holdTaskNotificationForShabbat(
  supabase: Pick<DbClient, "from">,
  requestBody: unknown,
  options: {
    authorizeTenant: (tenantId: string | null) => Promise<DirectRunDecision>;
    now?: Date;
  },
): Promise<ShabbatHoldResult | null> {
  const holdUntil = jerusalemShabbatHoldUntil(options.now ?? new Date());
  if (!holdUntil) {
    return null;
  }
  const body = isRecord(requestBody) ? requestBody : {};
  const response: ShabbatHoldResponse = {
    handled: true,
    sent: false,
    held: true,
    reason: "shabbat_quiet_hours",
    hold_until: holdUntil.toISOString(),
    task_id:
      text(isRecord(body.data) ? body.data.task_id : null, 64) || undefined,
    notification_type: text(body.trigger_type, 64) || undefined,
  };
  const peer = heldPeerNotification(requestBody);
  if (!peer) {
    return { status: 202, body: response };
  }

  const bodyTenantId = peer.request_body.tenant_id;
  const decision = await options.authorizeTenant(bodyTenantId);
  if (!decision.allowed) {
    return {
      status: decision.status,
      body: { error: decision.error, queued: false },
    };
  }
  const tenant = await holdTenantId(supabase, peer.task_id, bodyTenantId);
  if (tenant.refused === "task_not_found") {
    return {
      status: 202,
      body: { ...response, queued: false, not_queued: "task_not_found" },
    };
  }
  if (tenant.refused === "foreign_tenant") {
    return {
      status: 403,
      body: { error: "Task does not belong to this tenant", queued: false },
    };
  }

  const { error } = await supabase.from("task_notification_holds").insert({
    ...peer,
    request_body: { ...peer.request_body, tenant_id: tenant.tenantId },
    hold_reason: "shabbat",
    hold_until: holdUntil.toISOString(),
  });
  // 23505: already waiting. Partial unique index (WHERE released_at IS NULL),
  // so upsert onConflict can't target it.
  if (error && error.code !== "23505") {
    console.error("[task-notification-hold] could not queue", error.message);
    return {
      status: 202,
      body: { ...response, queued: false, not_queued: "queue_failed" },
    };
  }
  return { status: 202, body: { ...response, queued: true } };
}

/** The fields trigger-automation reads for a peer notification, nothing else. */
export function heldPeerNotification(
  requestBody: unknown,
): HeldPeerNotification | null {
  const body = isRecord(requestBody) ? requestBody : {};
  const type = text(body.trigger_type, 64);
  if (!PEER_TASK_NOTIFICATION_TYPES.has(type)) {
    return null;
  }
  const raw = isRecord(body.data) ? body.data : {};
  const taskId = text(raw.task_id, 64);
  if (!taskId) {
    return null;
  }
  const data: Record<string, string> = { task_id: taskId };
  const fields: Array<[string, number]> = [
    ["notify_campaigner_id", 64],
    ["user_id", 64],
    ["updater_name", 200],
    ["update_content", 4000],
  ];
  for (const [field, max] of fields) {
    const value = text(raw[field], max);
    if (value) {
      data[field] = value;
    }
  }
  const holdKey =
    type === "task_collaborator_added"
      ? `collaborator:${data.notify_campaigner_id || ""}`
      : `update:${data.user_id || ""}:${taskUpdateEventKey(data.update_content || "")}`;
  return {
    task_id: taskId,
    notification_type: type,
    hold_key: holdKey,
    request_body: {
      trigger_type: type,
      tenant_id: text(body.tenant_id, 64) || null,
      data,
    },
  };
}

/** A plain JSON object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trimmed string capped at max chars; "" for non-strings. */
function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
