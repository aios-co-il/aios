// The WhatsApp half of a scheduled report (AIO-255): the report link goes out
// from the line the schedule resolves to, a Green API phone or Carmen's Manus
// line, owned by the tenant or shared with it, and one the schedule's creator
// may use.
import {
  pickReportSender,
  type ReportSenderSource,
} from "../_shared/report-sender/pick.ts";
import { reportSenderFunction } from "../_shared/report-sender/routes.ts";
import type {
  ReportSender,
  ReportSenderType,
} from "../_shared/report-sender/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

export type ScheduleForWhatsApp = {
  id: string;
  tenant_id: string;
  client_id: string;
  created_by: string | null;
  whatsapp_integration_id: string | null;
  whatsapp_group_id: string | null;
  phone: string | null;
  clients: { whatsapp_group_id: string | null; phone: string | null } | null;
};

/** Which line sent, kept on report_deliveries.details (no phone, no secret). */
export type WhatsAppSenderDetail = {
  integration_id: string;
  type: ReportSenderType;
  source: ReportSenderSource;
};

export type WhatsAppChannelResult = {
  ok: boolean;
  error?: string;
  sender?: WhatsAppSenderDetail;
};

export type FunctionReply = { ok: boolean; status: number; text: string };

export type WhatsAppChannelDeps = {
  /** The lines userId may send the tenant's reports from. */
  listSenders(tenantId: string, userId: string): Promise<ReportSender[]>;
  tenantDefaultId(tenantId: string): Promise<string | null>;
  callFunction(
    name: string,
    body: Record<string, unknown>,
  ): Promise<FunctionReply>;
};

/**
 * Sends the message from the schedule's own line, else the tenant default,
 * else the only own line the creator may use, else the creator's own Green
 * API line (how scheduled reports were sent before). Only lines the creator
 * may use count, so another member's private line is never picked. A chosen
 * line that cannot send (the schedule's or the default) fails this channel,
 * as does no line at all; the worker still advances the cadence, so nothing
 * is resent.
 */
export async function sendScheduledWhatsApp(
  deps: WhatsAppChannelDeps,
  schedule: ScheduleForWhatsApp,
  message: string,
): Promise<WhatsAppChannelResult> {
  if (!schedule.created_by) {
    return { ok: false, error: "Missing schedule owner" };
  }
  const [senders, tenantDefaultId] = await Promise.all([
    deps.listSenders(schedule.tenant_id, schedule.created_by),
    deps.tenantDefaultId(schedule.tenant_id),
  ]);
  const pick = pickReportSender({
    senders,
    scheduleSenderId: schedule.whatsapp_integration_id,
    tenantDefaultId,
    callerUserId: schedule.created_by,
  });
  if ("error" in pick) {
    return { ok: false, error: pick.error };
  }
  const reply = await deps.callFunction(
    reportSenderFunction(pick.type, "text"),
    {
      clientId: schedule.client_id,
      tenantId: schedule.tenant_id,
      groupId:
        schedule.whatsapp_group_id || schedule.clients?.whatsapp_group_id,
      phoneNumber: schedule.phone || schedule.clients?.phone,
      message,
      senderUserId: schedule.created_by,
      integrationId: pick.sender.id,
      // Logged on the client card once, from report_deliveries.
      sendKind: "report",
      sendRef: schedule.id,
    },
  );
  const sender = {
    integration_id: pick.sender.id,
    type: pick.type,
    source: pick.source,
  };
  return { ...replyOutcome(reply), sender };
}

/**
 * A 202 means the Manus gateway did not confirm in time: the message may have
 * arrived, so it is not a success and is never retried.
 */
function replyOutcome(reply: FunctionReply): { ok: boolean; error?: string } {
  if (!reply.ok) {
    return {
      ok: false,
      error: reply.text.slice(0, 500) || `HTTP ${reply.status}`,
    };
  }
  return reply.status === 202
    ? { ok: false, error: "delivery_unknown" }
    : { ok: true };
}

/** The channel's reads and calls, over the service-role client. */
export function workerWhatsAppDeps(
  admin: DbClient,
  supabaseUrl: string,
  serviceRoleKey: string,
): WhatsAppChannelDeps {
  return {
    async listSenders(tenantId, userId) {
      const { data, error } = await admin.rpc("list_report_whatsapp_senders", {
        p_tenant_id: tenantId,
        p_user_id: userId,
      });
      if (error) {
        throw error;
      }
      return data ?? [];
    },
    async tenantDefaultId(tenantId) {
      const { data, error } = await admin
        .from("tenant_report_settings")
        .select("whatsapp_integration_id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data?.whatsapp_integration_id ?? null;
    },
    async callFunction(name, body) {
      const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    },
  };
}
