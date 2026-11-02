/**
 * Replays the peer task notifications trigger-automation held over Shabbat
 * (AIO-226), once each. Nothing is replayed late: a hold still unreleased 24h
 * after its release time expires unsent.
 */
import type { Json } from "../_shared/database.types.ts";
import {
  type HeldPeerNotification,
  parseHeldRequestBody,
} from "../_shared/shabbat/held-peer-notification.ts";
import { jerusalemShabbatHoldUntil } from "../_shared/shabbat/quiet-window.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

const HELD_TASK_NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type HeldReleaseResult = {
  hold_id: string;
  task_id?: string;
  notification_type?: string;
  released?: boolean;
  expired?: boolean;
  result?: unknown;
  error?: string;
  /** Delivery happened, but writing release_result failed. */
  record_error?: string;
};

type Deliver = (
  requestBody: HeldPeerNotification["request_body"],
) => Promise<unknown>;

/**
 * Delivers each due hold once. The claim (released_at) happens before the
 * send, so overlapping worker runs cannot both deliver it.
 */
export async function releaseHeldTaskNotifications(
  supabase: Pick<DbClient, "from">,
  deliver: Deliver,
  now: Date = new Date(),
  limit = 25,
): Promise<HeldReleaseResult[]> {
  if (jerusalemShabbatHoldUntil(now)) {
    return [];
  }
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
    if (claimError) {
      console.error(
        "[task-notification-hold] claim failed",
        row.id,
        claimError.message,
      );
      continue;
    }
    if (!claimed) {
      continue;
    }
    const base = {
      hold_id: row.id,
      task_id: row.task_id,
      notification_type: row.notification_type,
    };
    if (expired) {
      results.push({ ...base, expired: true });
      continue;
    }
    results.push({
      ...base,
      released: true,
      ...(await deliverHold(supabase, row.id, row.request_body, deliver)),
    });
  }
  return results;
}

/** Sends one claimed hold and records the outcome in release_result. */
async function deliverHold(
  supabase: Pick<DbClient, "from">,
  holdId: string,
  storedBody: Json,
  deliver: Deliver,
): Promise<Pick<HeldReleaseResult, "result" | "error" | "record_error">> {
  const requestBody = parseHeldRequestBody(storedBody);
  if (!requestBody) {
    const error = "invalid_request_body";
    const recordError = await recordRelease(supabase, holdId, {
      delivered: false,
      error,
    });
    return { error, ...recordError };
  }

  try {
    const result = await deliver(requestBody);
    const recordError = await recordRelease(supabase, holdId, {
      delivered: true,
      result: asStoredJson(result),
    });
    return { result, ...recordError };
  } catch (deliverError) {
    const message =
      deliverError instanceof Error
        ? deliverError.message
        : String(deliverError);
    const recordError = await recordRelease(supabase, holdId, {
      delivered: false,
      error: message,
    });
    return { error: message, ...recordError };
  }
}

/** Writes release_result; a failure is logged and returned, never thrown. */
async function recordRelease(
  supabase: Pick<DbClient, "from">,
  holdId: string,
  releaseResult: { [key: string]: Json | undefined },
): Promise<Pick<HeldReleaseResult, "record_error">> {
  const { error } = await supabase
    .from("task_notification_holds")
    .update({ release_result: releaseResult })
    .eq("id", holdId);
  if (!error) {
    return {};
  }
  console.error(
    "[task-notification-hold] could not record release",
    holdId,
    error.message,
  );
  return { record_error: error.message };
}

/** trigger-automation's reply was parsed from JSON, so it round-trips as Json. */
function asStoredJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}
