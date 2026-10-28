import type { Json } from "../database.types.ts";

/**
 * A task_notification_holds row (AIO-226): the request trigger-automation
 * stored over Shabbat and task-notification-worker replays once.
 */
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

type HeldRequestBody = HeldPeerNotification["request_body"];

/** The stored request_body when it still has the shape trigger-automation
 * wrote, else null; the column is plain jsonb, so a read is checked. */
export function parseHeldRequestBody(value: Json): HeldRequestBody | null {
  if (!isJsonRecord(value) || typeof value.trigger_type !== "string") {
    return null;
  }

  const tenantId = value.tenant_id;
  if (tenantId !== null && typeof tenantId !== "string") {
    return null;
  }

  const data = stringRecord(value.data);
  if (!data) {
    return null;
  }

  return { trigger_type: value.trigger_type, tenant_id: tenantId, data };
}

function isJsonRecord(
  value: Json | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: Json | undefined): Record<string, string> | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) {
    return null;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}
