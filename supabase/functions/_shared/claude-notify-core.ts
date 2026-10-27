/**
 * claude-notify core: auth, recipient + transport planning, the real send and
 * the ping report. The edge function (claude-notify/index.ts) only wires env
 * and the Supabase client into createClaudeNotifyHandler, so the whole request
 * path is testable under deno test.
 *
 * Auth fails closed: a request must carry CLAUDE_MCP_BEARER or this project's
 * service-role key. When CLAUDE_MCP_BEARER is unset, only the service-role key
 * is accepted (it used to accept anyone).
 *
 * Transport: Carmen alerts leave from her own line, and only from a PRIMARY
 * Carmen connection (a secondary one, such as the owner's personal phone,
 * never sends system notifications). The tenant's Carmen send_manus_message
 * step is preferred whenever it resolves to an active, primary manus_wa line.
 * A Green API step (David's operator phone) is used only when no Manus step
 * does, and the response labels it transport:"green_fallback" with a
 * console.warn, so it is never silent. See claude-notify-transport.ts.
 *
 * Body: { tenant_id, message, chat_id? }  → { sent, status, transport, error, … }
 *       { ping: true, tenant_id? }        → per tenant: step type it would use,
 *                                            line role, Manus integration status;
 *                                            sends nothing.
 */

import {
  normalizeNotifyPhone,
  pickNotifyDelivery,
  resolveCarmenNotifyTarget,
  type NotifyBridgeSession,
  type ResolveCarmenNotifyTargetResult,
} from "./carmen-notify-target.ts";
import { loadCarmenReportRecipients } from "./carmen-report-recipients/load.ts";
import { isServiceKey, timingSafeEqualStr } from "./timing-safe-equal.ts";
import { readWaSendResponse, type WaSendStatus } from "./wa-send-result.ts";
import {
  CARMEN_TRIGGER_ACTION,
  GREEN_INTEGRATION_TYPES,
  isManusIntegration,
  MANUS_INTEGRATION_TYPES,
  NOTIFY_SEND_ACTIONS,
  notifyLineRole,
  selectNotifyTransport,
  stepIntegrationId,
  tenantHasActiveManus,
  type NotifyIntegrationRow,
  type NotifyStepRow,
  type NotifyTransportPlan,
} from "./claude-notify-transport.ts";

const PING_TENANT_LIMIT = 200;
const PING_CONCURRENCY = 8;

// ── Auth ─────────────────────────────────────────────────────────────────────

export function bearerFrom(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export type NotifyAuthResult =
  { ok: true; via: "bearer" | "service_role" } | { ok: false };

export function authorizeNotifyRequest(input: {
  authorization: string | null | undefined;
  bearerSecret?: string | null;
  serviceRoleKey?: string | null;
}): NotifyAuthResult {
  const token = bearerFrom(input.authorization);
  if (!token) return { ok: false };
  const secret = (input.bearerSecret || "").trim();
  if (secret && timingSafeEqualStr(token, secret)) {
    return { ok: true, via: "bearer" };
  }
  if (isServiceKey(token, (input.serviceRoleKey || "").trim())) {
    return { ok: true, via: "service_role" };
  }
  return { ok: false };
}

// ── Planning (DB reads only) ─────────────────────────────────────────────────

type SessionRow = NotifyBridgeSession & { last_message_at?: string | null };

export type TenantNotifyPlan = {
  tenantId: string;
  target: ResolveCarmenNotifyTargetResult;
  delivery: ReturnType<typeof pickNotifyDelivery> | null;
  transport: NotifyTransportPlan;
  senderUserId: string | null;
  activeManusIntegrations: number;
  primaryManusIntegrations: number;
};

function unique<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v != null && v !== ""))];
}

async function loadCarmenSendSetup(
  sb: any,
  tenantId: string,
  bridgeAutomationId: string | null,
) {
  const { data: triggers } = await sb
    .from("automation_flow_steps")
    .select("automation_id, configuration")
    .eq("tenant_id", tenantId)
    .eq("step_type", "trigger")
    .eq("action_type", CARMEN_TRIGGER_ACTION);
  const ids = unique<string>([
    ...(triggers || []).map((t: any) => t.automation_id),
    bridgeAutomationId,
  ]);
  // Carmen trigger pin (carmen_integration_id) per automation.
  const triggerPins: Record<string, string | null> = {};
  for (const t of triggers || []) {
    const pin = t?.configuration?.carmen_integration_id;
    if (pin && !triggerPins[t.automation_id])
      triggerPins[t.automation_id] = String(pin);
  }

  // settings carries carmen_role: only primary lines may send notifications.
  const integrationCols =
    "id, tenant_id, user_id, integration_type, is_active, created_at, settings";
  const [{ data: automations }, { data: steps }, { data: tenantLines }] =
    await Promise.all([
      ids.length
        ? sb.from("automations").select("id, active").in("id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb
            .from("automation_flow_steps")
            .select("automation_id, action_type, configuration, created_at")
            .in("automation_id", ids)
            .eq("step_type", "action")
            .in("action_type", NOTIFY_SEND_ACTIONS)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      sb
        .from("tenant_integrations")
        .select(integrationCols)
        .eq("tenant_id", tenantId)
        .in("integration_type", [
          ...MANUS_INTEGRATION_TYPES,
          ...GREEN_INTEGRATION_TYPES,
        ]),
    ]);

  const known = new Set((tenantLines || []).map((r: any) => r.id));
  const referenced = unique<string>([
    ...((steps || []) as NotifyStepRow[]).map(stepIntegrationId),
    ...Object.values(triggerPins),
  ]).filter((id) => !known.has(id));
  const { data: referencedRows } = referenced.length
    ? await sb
        .from("tenant_integrations")
        .select(integrationCols)
        .in("id", referenced)
    : { data: [] };

  return {
    activeAutomationIds: (automations || [])
      .filter((a: any) => a.active === true)
      .map((a: any) => a.id as string),
    steps: (steps || []) as NotifyStepRow[],
    integrations: [
      ...(tenantLines || []),
      ...(referencedRows || []),
    ] as NotifyIntegrationRow[],
    triggerPins,
  };
}

export async function planTenantNotify(
  sb: any,
  tenantId: string,
  explicitChatId: string | null,
): Promise<TenantNotifyPlan> {
  const [report, { data: sessionRows }, { data: campaigners }] =
    await Promise.all([
      loadCarmenReportRecipients(sb, tenantId),
      sb
        .from("carmen_whatsapp_sessions")
        .select(
          "chat_id, phone, sender_name, connection_user_id, automation_id, last_message_at",
        )
        .eq("tenant_id", tenantId)
        .neq("phone", "")
        .order("last_message_at", { ascending: false })
        .limit(40),
      sb
        .from("campaigners")
        .select("full_name, phone, role, active")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .limit(200),
    ]);
  const sessions = (sessionRows || []) as SessionRow[];
  if (report.error) {
    // The staff fallback below still finds a tenant campaigner.
    console.warn("[claude-notify] report recipients unavailable", {
      tenantId,
      error: report.error,
    });
  }

  const staff = (campaigners || [])
    .filter((c: any) => !!normalizeNotifyPhone(c.phone))
    .map((c: any) => ({
      phone: c.phone as string,
      full_name: c.full_name as string | null,
      role: Array.isArray(c.role) ? (c.role[0] ?? null) : (c.role ?? null),
    }));

  const target = resolveCarmenNotifyTarget({
    preferredPhone: explicitChatId,
    reportRecipients: report.recipients,
    sessions: sessions.map((s) => ({
      chat_id: s.chat_id,
      phone: s.phone,
      sender_name: s.sender_name,
      updated_at: s.last_message_at,
    })),
    staff,
  });

  // Prefer a PRIVATE session matching the resolved phone. A newer group row
  // with the same speaker phone must not steal notify into the group. Group
  // rows may still provide the automation_id bridge.
  const delivery =
    target.source === "none" || !target.phone
      ? null
      : pickNotifyDelivery(sessions, target);
  const bridge =
    delivery?.bridgeSession ?? sessions.find((s) => !!s.automation_id) ?? null;

  const setup = await loadCarmenSendSetup(
    sb,
    tenantId,
    bridge?.automation_id ?? null,
  );
  // The connection each automation last spoke on: the bridge session's for
  // the bridge automation, else that automation's latest session.
  const connectionUserIds: Record<string, string> = {};
  if (bridge?.automation_id && bridge.connection_user_id)
    connectionUserIds[bridge.automation_id] = bridge.connection_user_id;
  for (const s of sessions) {
    if (s.automation_id && s.connection_user_id)
      connectionUserIds[s.automation_id] ??= s.connection_user_id;
  }
  const transport = selectNotifyTransport({
    tenantId,
    bridgeAutomationId: bridge?.automation_id ?? null,
    connectionUserIds,
    ...setup,
  });

  const sessionForStep = sessions.find(
    (s) => s.automation_id === transport.automationId && !!s.connection_user_id,
  );
  const senderUserId =
    transport.transport === "none"
      ? null
      : sessionForStep?.connection_user_id ||
        bridge?.connection_user_id ||
        (transport.transport === "manus"
          ? transport.integrationUserId
          : null) ||
        null;

  const activeManus = setup.integrations.filter(
    (r) => r.tenant_id === tenantId && isManusIntegration(r) && r.is_active,
  );
  const hasActiveManus = tenantHasActiveManus(tenantId, setup.integrations);
  return {
    tenantId,
    target,
    delivery,
    transport,
    senderUserId,
    activeManusIntegrations: activeManus.length,
    primaryManusIntegrations: activeManus.filter(
      (r) => notifyLineRole(r, hasActiveManus) === "primary",
    ).length,
  };
}

async function listNotifyTenants(sb: any): Promise<string[]> {
  const [{ data: triggers }, { data: pulse }] = await Promise.all([
    sb
      .from("automation_flow_steps")
      .select("tenant_id")
      .eq("step_type", "trigger")
      .eq("action_type", CARMEN_TRIGGER_ACTION),
    sb
      .from("tenant_heartbeat_settings")
      .select("tenant_id")
      .eq("campaign_pulse_enabled", true),
  ]);
  return unique<string>([
    ...(triggers || []).map((r: any) => r.tenant_id),
    ...(pulse || []).map((r: any) => r.tenant_id),
  ])
    .sort()
    .slice(0, PING_TENANT_LIMIT);
}

export function pingReport(plan: TenantNotifyPlan) {
  return {
    tenant_id: plan.tenantId,
    transport: plan.transport.transport,
    step_type: plan.transport.actionType,
    automation_id: plan.transport.automationId,
    integration_id: plan.transport.integrationId,
    integration_role: plan.transport.integrationRole,
    integration_primary: plan.transport.integrationRole === "primary",
    manus_integration_active: plan.transport.manusIntegrationActive,
    active_manus_integrations: plan.activeManusIntegrations,
    primary_manus_integrations: plan.primaryManusIntegrations,
    skipped_lines: plan.transport.skipped.map((s) => ({
      automation_id: s.automationId,
      integration_id: s.integrationId,
      role: s.role,
      reason: s.reason,
    })),
    recipient_source: plan.target.source,
    sender_resolved: !!plan.senderUserId,
    reason: plan.transport.reason,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type NotifySendStatus =
  WaSendStatus | "no_recipient" | "no_transport" | "no_sender";

export type ClaudeNotifyDeps = {
  supabaseUrl: string;
  serviceRoleKey: string;
  bearerSecret?: string | null;
  createSupabase: () => any;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "warn" | "error">;
};

export function createClaudeNotifyHandler(deps: ClaudeNotifyDeps) {
  const doFetch = deps.fetchImpl ?? fetch;
  const logger = deps.logger ?? console;

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS")
      return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const auth = authorizeNotifyRequest({
      authorization: req.headers.get("authorization"),
      bearerSecret: deps.bearerSecret,
      serviceRoleKey: deps.serviceRoleKey,
    });
    if (!auth.ok) return json({ error: "unauthorized" }, 401);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const sb = deps.createSupabase();
    const tenantId = String(body?.tenant_id ?? "").trim();

    if (body?.ping === true) {
      const tenantIds = tenantId ? [tenantId] : await listNotifyTenants(sb);
      const tenants = [];
      for (let i = 0; i < tenantIds.length; i += PING_CONCURRENCY) {
        const batch = tenantIds.slice(i, i + PING_CONCURRENCY);
        const plans = await Promise.all(
          batch.map((id) => planTenantNotify(sb, id, null)),
        );
        tenants.push(...plans.map(pingReport));
      }
      return json({
        ok: true,
        ping: true,
        auth: auth.via,
        sent: false,
        tenants,
      });
    }

    const message = String(body?.message ?? "").trim();
    const explicitChatId = body?.chat_id ? String(body.chat_id).trim() : null;
    if (!tenantId || !message)
      return json({ error: "tenant_id and message are required" }, 400);

    const plan = await planTenantNotify(sb, tenantId, explicitChatId);
    const { target, delivery, transport } = plan;
    const meta = {
      transport: transport.transport,
      automation_id: transport.automationId,
      integration_id: transport.integrationId,
      source: target.source,
    };
    const refuse = (status: NotifySendStatus, error: string) =>
      json({
        ok: false,
        sent: false,
        status,
        error,
        reason: error,
        ...meta,
        chat_id: delivery?.chatId ?? null,
      });

    if (!delivery) {
      return refuse(
        "no_recipient",
        target.reason ||
          "no resolvable Carmen WhatsApp recipient for this tenant",
      );
    }
    if (!transport.functionName) {
      return refuse(
        "no_transport",
        `no Carmen WhatsApp send step on a primary Carmen line for this tenant (${transport.reason})`,
      );
    }
    if (!plan.senderUserId) {
      return refuse(
        "no_sender",
        "no connection user to send as on the tenant's Carmen line",
      );
    }
    if (transport.transport === "green_fallback") {
      logger.warn(
        "[claude-notify] green_fallback: no Carmen Manus step resolves to an active primary line; sending from the Green API line",
        {
          tenantId,
          automationId: transport.automationId,
          reason: transport.reason,
        },
      );
    }

    const sendBody: Record<string, unknown> = {
      tenantId,
      senderUserId: plan.senderUserId,
      phoneNumber: delivery.phoneNumber,
      message,
    };
    if (transport.integrationId)
      sendBody.integrationId = transport.integrationId;

    let outcome;
    try {
      const res = await doFetch(
        `${deps.supabaseUrl}/functions/v1/${transport.functionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deps.serviceRoleKey}`,
          },
          body: JSON.stringify(sendBody),
        },
      );
      outcome = await readWaSendResponse(res);
    } catch (e) {
      outcome = {
        sent: false,
        status: "failed" as const,
        error: e instanceof Error ? e.message : String(e),
        providerMessageId: null,
        httpStatus: null,
      };
    }
    if (!outcome.sent) {
      logger.error("[claude-notify] send not confirmed", {
        tenantId,
        transport: transport.transport,
        status: outcome.status,
        httpStatus: outcome.httpStatus,
        error: outcome.error?.slice(0, 300),
      });
    }

    return json({
      ok: outcome.sent,
      sent: outcome.sent,
      status: outcome.status,
      error: outcome.error,
      message_id: outcome.providerMessageId,
      ...meta,
      chat_id: delivery.chatId,
      phone: delivery.phoneNumber,
      contact_name: target.contactName,
    });
  };
}
