import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { FakeTime } from "jsr:@std/testing@1/time";

import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const TENANT = "11111111-1111-4111-8111-111111111111";

/** 09:00 Israel on a Wednesday: the hour the old anomaly digest went out. */
const DIGEST_HOUR = new Date("2026-10-28T06:00:00Z");

/** A tenant with reminders on, an anomaly, an overdue task and a campaigner with a phone. */
const tables = {
  tenant_heartbeat_settings: [
    {
      tenant_id: TENANT,
      enabled: true,
      allowed_actions: ["reminders"],
      active_hours_start: 0,
      active_hours_end: 24,
    },
  ],
  tasks: [
    {
      id: "task-1",
      tenant_id: TENANT,
      title: "דוח חודשי",
      status: "open",
      due_date: "2026-10-20",
      overdue_notified_at: null,
    },
  ],
  agent_tasks: [
    {
      id: "anomaly-1",
      tenant_id: TENANT,
      title: "CPL קפץ",
      task_mode: "anomaly_alert",
      created_at: "2026-10-28T05:00:00Z",
    },
  ],
  campaigners: [
    { tenant_id: TENANT, full_name: "Anna", phone: "0501234567", active: true },
  ],
};

Deno.test({
  name: "agent-heartbeat index",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "sends no WhatsApp; 'reminders' only nudges task-notification-worker",
      async () => {
        const http = fakeSupabaseHttp({
          supabaseUrl: SUPABASE_URL,
          tables,
          other: () => Response.json({ ok: true }),
        });
        const env = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key" };
        const time = new FakeTime(DIGEST_HOUR);
        try {
          const res = await withRuntime(
            { env, fetch: http.fetch },
            async () => {
              const handle = await servedHandler(
                new URL("./index.ts", import.meta.url),
              );
              return await handle(
                new Request(SUPABASE_URL, { method: "POST" }),
              );
            },
          );
          assertStrictEquals(res.status, 200);
        } finally {
          time.restore();
        }

        const functions = http.calls
          .filter((c) => c.url.pathname.startsWith("/functions/v1/"))
          .map((c) => c.url.pathname);
        assertEquals(functions, [
          "/functions/v1/task-notification-worker",
          "/functions/v1/run-ai-agent",
        ]);
        const log = http.calls.find(
          (c) =>
            c.method === "POST" && c.url.pathname.endsWith("/heartbeat_logs"),
        );
        assertEquals(actionTypes(log?.body), ["overdue_worker_nudged"]);
      },
    );
  },
});

/** The action types a heartbeat_logs insert recorded. */
function actionTypes(body: unknown): unknown[] {
  const actions =
    isRecord(body) && Array.isArray(body.actions_taken)
      ? body.actions_taken
      : [];
  return actions.map((action) => (isRecord(action) ? action.type : null));
}

/** Whether a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
