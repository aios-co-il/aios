/** Continuation requests over in-memory rows, for the device-turn continuation tests. */
import { assert } from "jsr:@std/assert@1";
import {
  ACTION,
  doneRow,
  ME,
  NOW,
  openOver,
  panelTurn,
  RUN,
  tablesWith,
  TENANT,
} from "./turn.test-fixture.ts";

/** The one answer every refused continuation gets. */
export const REFUSED = { success: false, error: "device_step_unavailable" };

/** The stop the user recorded for this run. */
export const MY_STOP = { run_id: RUN, user_id: ME, tenant_id: TENANT };

/** A continuation request body for `actionId`, from the same run and tab. */
export function continuationBody(
  actionId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { device_continuation: actionId, ...extra };
}

/** Opens a continuation of ACTION over these steps and stops. */
export function continueOver(
  steps: Array<Record<string, unknown>>,
  stops: Array<Record<string, unknown>> = [],
  body: Record<string, unknown> = continuationBody(ACTION),
  failing?: string,
) {
  const tables = tablesWith(steps, stops);
  return openOver(tables, panelTurn({}, body), failing).then((opened) => ({
    ...opened,
    tables,
  }));
}

/** The reply's status and body, for a turn answered without the model. */
export async function replyOf(reply: Response | null) {
  assert(reply, "the request is answered without the model");
  return { status: reply.status, body: await reply.json() };
}

/** A panel that announced every device tool the server offers. */
export const ALL_TOOLS = {
  device: {
    tools: [
      "browser_read_page",
      "browser_navigate",
      "browser_click",
      "browser_type",
    ],
  },
};

/** A step of this run written at `minute` past the hour, with `overrides`. */
export function stepAt(minute: number, overrides: Record<string, unknown>) {
  return doneRow({
    id: crypto.randomUUID(),
    created_at: `2026-11-26T10:${String(minute).padStart(2, "0")}:00.000Z`,
    consumed_at: NOW.toISOString(),
    result: null,
    ...overrides,
  });
}
