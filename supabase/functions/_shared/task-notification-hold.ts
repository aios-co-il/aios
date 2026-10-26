/**
 * Shabbat hold for task WhatsApp notifications (AIO-226).
 *
 * David's rule: no task notifications on Saturday (Asia/Jerusalem, whole day).
 * What was held goes out on Sunday at 08:30, the start of the normal window:
 *  - worker-driven notifications (assignment, reminders, overdue, completion,
 *    self reminder) are simply not claimed during the window; their task
 *    markers stay NULL and the worker's next run after the window sends them;
 *  - peer notifications (collaborator added, update added) come straight from
 *    the app, so trigger-automation parks them in task_notification_holds and
 *    the worker releases each one once.
 * Nothing is replayed late: a hold that is still unreleased 24h after its
 * release time expires unsent.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jerusalemShabbatHoldUntil } from "./calendarTimeZone.ts";
import { taskUpdateEventKey } from "./task-notification-dedupe.ts";

export const TASK_NOTIFICATION_RESUME_LOCAL = { hour: 8, minute: 30 } as const;
export const HELD_TASK_NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PEER_TASK_NOTIFICATION_TYPES = new Set([
  "task_collaborator_added",
  "task_update_added",
]);

/** Saturday 00:00 → Sunday 08:30 Israel: when task WhatsApp may resume, else null. */
export function taskNotificationsHeldUntil(
  now: Date = new Date(),
): Date | null {
  return jerusalemShabbatHoldUntil(now, TASK_NOTIFICATION_RESUME_LOCAL);
}

export type HeldPeerNotification = {
  task_id: string;
  notification_type: string;
  hold_key: string;
  request_body: {
    trigger_type: string;
    tenant_id: string | null;
    data: Record<string, string>;
  };
};

const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** The fields trigger-automation reads for a peer notification, nothing else. */
export function heldPeerNotification(
  requestBody: any,
): HeldPeerNotification | null {
  const type = text(requestBody?.trigger_type, 64);
  if (!PEER_TASK_NOTIFICATION_TYPES.has(type)) return null;
  const raw = requestBody?.data || {};
  const taskId = text(raw.task_id, 64);
  if (!taskId) return null;
  const data: Record<string, string> = { task_id: taskId };
  const fields: Array<[string, number]> = [
    ["notify_campaigner_id", 64],
    ["user_id", 64],
    ["updater_name", 200],
    ["update_content", 4000],
  ];
  for (const [field, max] of fields) {
    const value = text(raw[field], max);
    if (value) data[field] = value;
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
      tenant_id: text(requestBody?.tenant_id, 64) || null,
      data,
    },
  };
}

export type ShabbatHoldResponse = {
  handled: true;
  sent: false;
  held: true;
  reason: "shabbat_quiet_hours";
  hold_until: string;
  queued?: boolean;
  task_id?: string;
  notification_type?: string;
};

/**
 * trigger-automation front door. Returns null outside the window. Inside it,
 * nothing is sent: worker-driven types answer sent:false so the worker
 * releases its marker and retries after the window; peer types are queued.
 */
export async function holdTaskNotificationForShabbat(
  supabase: any,
  requestBody: any,
  now: Date = new Date(),
): Promise<ShabbatHoldResponse | null> {
  const holdUntil = taskNotificationsHeldUntil(now);
  if (!holdUntil) return null;
  const response: ShabbatHoldResponse = {
    handled: true,
    sent: false,
    held: true,
    reason: "shabbat_quiet_hours",
    hold_until: holdUntil.toISOString(),
    task_id: text(requestBody?.data?.task_id, 64) || undefined,
    notification_type: text(requestBody?.trigger_type, 64) || undefined,
  };
  const peer = heldPeerNotification(requestBody);
  if (!peer) return response;

  const { error } = await supabase.from("task_notification_holds").insert({
    ...peer,
    hold_reason: "shabbat",
    hold_until: holdUntil.toISOString(),
  });
  // 23505: the same notification is already waiting.
  if (error && error.code !== "23505") {
    console.error("[task-notification-hold] could not queue", error.message);
    return { ...response, queued: false };
  }
  return { ...response, queued: true };
}

export type HeldReleaseResult = {
  hold_id: string;
  task_id?: string;
  notification_type?: string;
  released?: boolean;
  expired?: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Worker side: deliver each due hold once. The claim (released_at) happens
 * before the send, so overlapping worker runs cannot both deliver it.
 */
export async function releaseHeldTaskNotifications(
  supabase: any,
  deliver: (
    requestBody: HeldPeerNotification["request_body"],
  ) => Promise<unknown>,
  now: Date = new Date(),
  limit = 25,
): Promise<HeldReleaseResult[]> {
  if (taskNotificationsHeldUntil(now)) return [];
  const nowIso = now.toISOString();
  const { data: due, error } = await supabase
    .from("task_notification_holds")
    .select("id, task_id, notification_type, request_body, hold_until")
    .is("released_at", null)
    .lte("hold_until", nowIso)
    .order("hold_until", { ascending: true })
    .limit(limit);
  if (error) {
    console.error(
      "[task-notification-hold] release query failed",
      error.message,
    );
    return [];
  }

  const results: HeldReleaseResult[] = [];
  for (const row of due || []) {
    const expired =
      now.getTime() - Date.parse(row.hold_until) >
      HELD_TASK_NOTIFICATION_MAX_AGE_MS;
    const { data: claimed, error: claimError } = await supabase
      .from("task_notification_holds")
      .update({
        released_at: nowIso,
        release_result: expired ? { expired: true } : null,
      })
      .eq("id", row.id)
      .is("released_at", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;
    const base = {
      hold_id: row.id,
      task_id: row.task_id,
      notification_type: row.notification_type,
    };
    if (expired) {
      results.push({ ...base, expired: true });
      continue;
    }
    try {
      const result = await deliver(row.request_body);
      await supabase
        .from("task_notification_holds")
        .update({ release_result: { delivered: true, result } })
        .eq("id", row.id);
      results.push({ ...base, released: true, result });
    } catch (deliverError) {
      const message =
        deliverError instanceof Error
          ? deliverError.message
          : String(deliverError);
      await supabase
        .from("task_notification_holds")
        .update({ release_result: { delivered: false, error: message } })
        .eq("id", row.id);
      results.push({ ...base, released: true, error: message });
    }
  }
  return results;
}
