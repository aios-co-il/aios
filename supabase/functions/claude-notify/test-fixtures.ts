/** Rows and a wired handler shared by the claude-notify Deno tests. */

import { fakeFetch } from "../_shared/testing/fake-fetch.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { createClaudeNotifyHandler } from "./handler.ts";

type Row = Record<string, unknown>;

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const DAVID_USER = "22222222-2222-4222-8222-222222222222";
export const SERVICE_KEY = "service-role-key-of-this-project";
export const BEARER = "claude-mcp-bearer";
export const PHONE = "972501234567";

/** A send_green_api_message step naming its Green line. */
export const greenStep = (
  automation_id: string,
  created_at = "2026-01-01",
  green_api_integration_id = "green-1",
) => ({
  tenant_id: TENANT,
  automation_id,
  action_type: "send_green_api_message",
  configuration: { green_api_integration_id },
  created_at,
});

/** A send_manus_message step, naming a line only when integration_id is set. */
export const manusStep = (
  automation_id: string,
  integration_id: string | null,
  created_at = "2026-02-01",
) => ({
  tenant_id: TENANT,
  automation_id,
  action_type: "send_manus_message",
  configuration: integration_id ? { integration_id } : {},
  created_at,
});

/** A manus_wa line of TENANT. */
export const manusLine = (
  id: string,
  is_active = true,
  user_id: string | null = null,
  extra: Row = {},
) => ({
  id,
  tenant_id: TENANT,
  user_id,
  integration_type: "manus_wa",
  is_active,
  created_at: "2026-01-01",
  settings: { instance_id: `inst-${id}` },
  ...extra,
});

/** An active green_api line of TENANT. */
export const greenLine = (id = "green-1", extra: Row = {}) => ({
  id,
  tenant_id: TENANT,
  user_id: null,
  integration_type: "green_api",
  is_active: true,
  created_at: "2025-06-01",
  settings: { instance_id: `inst-${id}` },
  ...extra,
});

/** The row with settings.carmen_role set. */
export const withRole = <T extends { settings: Row }>(
  row: T,
  carmen_role: string,
) => ({ ...row, settings: { ...row.settings, carmen_role } });

/** DB tables of a tenant with one Carmen automation (auto-1) and David's session. */
export function tenantTables({
  steps,
  integrations,
  sessions,
  trigger = {},
}: {
  steps?: Row[];
  integrations?: Row[];
  sessions?: Row[];
  trigger?: Row;
} = {}): Record<string, Row[]> {
  return {
    tenant_heartbeat_settings: [
      {
        tenant_id: TENANT,
        campaign_pulse_phone: PHONE,
        campaign_pulse_enabled: true,
      },
    ],
    carmen_whatsapp_sessions: sessions ?? [
      {
        tenant_id: TENANT,
        chat_id: `${PHONE}@c.us`,
        phone: PHONE,
        sender_name: "David",
        connection_user_id: DAVID_USER,
        automation_id: "auto-1",
        last_message_at: "2026-10-25T08:00:00Z",
      },
    ],
    campaigners: [],
    automation_flow_steps: [
      {
        tenant_id: TENANT,
        automation_id: "auto-1",
        step_type: "trigger",
        action_type: "carmen_whatsapp_session",
        configuration: trigger,
      },
      ...(steps ?? [manusStep("auto-1", "manus-1")]).map((s) => ({
        ...s,
        step_type: "action",
      })),
    ],
    automations: [{ id: "auto-1", tenant_id: TENANT, active: true }],
    tenant_integrations: integrations ?? [manusLine("manus-1")],
  };
}

/** The handler over a fake DB, recording sends, warnings and errors. Lines of other tenants are shared only through `rpc`. */
export function handler({
  tables = tenantTables(),
  responses,
  bearerSecret = null,
  failing,
  rpc,
}: {
  tables?: Record<string, Row[]>;
  responses?: { status?: number; body?: unknown }[];
  bearerSecret?: string | null;
  failing?: Record<string, string>;
  rpc?: Record<string, (args: Row) => unknown>;
} = {}) {
  const fetch = fakeFetch(responses);
  const warnings: unknown[][] = [];
  const errors: unknown[][] = [];
  const db = fakeSupabase(tables, { failing, rpc });
  const handle = createClaudeNotifyHandler({
    supabaseUrl: "https://this-project.supabase.co",
    serviceRoleKey: SERVICE_KEY,
    bearerSecret,
    createSupabase: () => db,
    fetchImpl: fetch.impl,
    logger: {
      warn: (...a: unknown[]) => warnings.push(a),
      error: (...a: unknown[]) => errors.push(a),
    },
  });
  return { handle, fetch, warnings, errors, db };
}

/** A POST to claude-notify, with a bearer when `token` is set. */
export function post(body: unknown, token?: string): Request {
  return new Request("https://x/functions/v1/claude-notify", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

export const notifyBody = { tenant_id: TENANT, message: "שלום" };
