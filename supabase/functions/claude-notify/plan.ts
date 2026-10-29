/**
 * Who a tenant's notify goes to and which Carmen line it leaves from. DB reads
 * only; a failed read throws.
 *
 * Recipient: explicit chat_id / campaign_pulse_phone / tenant campaigner,
 * never a cross-tenant owner who merely has the newest session, never a group
 * chat. Always 1:1.
 */

import { isPrimaryCarmenLine } from "../_shared/carmen-connection-role.ts";
import {
  pickNotifyDelivery,
  resolveCarmenNotifyTarget,
  type ResolveCarmenNotifyTargetResult,
} from "../_shared/carmen-notify-target.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  isManusIntegration,
  tenantHasActiveManus,
  type NotifyIntegrationRow,
} from "./lines.ts";
import { loadNotifyRecipients } from "./recipients.ts";
import { loadCarmenSendSetup } from "./send-setup.ts";
import { loadNotifySenders } from "./senders.ts";
import { selectNotifyTransport } from "./transport.ts";
import type { NotifyTransportPlan } from "./transport-plan.ts";

export type TenantNotifyPlan = {
  tenantId: string;
  target: ResolveCarmenNotifyTargetResult;
  delivery: ReturnType<typeof pickNotifyDelivery> | null;
  transport: NotifyTransportPlan;
  senderUserId: string | null;
  activeManusIntegrations: number;
  primaryManusIntegrations: number;
};

/** Recipient, delivery chat, transport line and sender for one tenant's notify. */
export async function planTenantNotify(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  explicitChatId: string | null,
): Promise<TenantNotifyPlan> {
  const { campaignPulsePhone, sessions, staff } = await loadNotifyRecipients(
    sb,
    tenantId,
  );
  const target = resolveCarmenNotifyTarget({
    preferredPhone: explicitChatId,
    campaignPulsePhone,
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
  const senders = await loadNotifySenders(
    sb,
    tenantId,
    sessions,
    bridge,
    setup,
  );
  const transport = selectNotifyTransport({
    tenantId,
    bridgeAutomationId: bridge?.automation_id ?? null,
    ...senders,
    ...setup,
  });
  return {
    tenantId,
    target,
    delivery,
    transport,
    senderUserId: transport.senderUserId,
    ...manusLineCounts(tenantId, setup.integrations),
  };
}

/** How many active Manus lines the tenant has, and how many of them are primary. */
function manusLineCounts(
  tenantId: string,
  integrations: NotifyIntegrationRow[],
): Pick<
  TenantNotifyPlan,
  "activeManusIntegrations" | "primaryManusIntegrations"
> {
  const activeManus = integrations.filter(
    (r) => r.tenant_id === tenantId && isManusIntegration(r) && r.is_active,
  );
  const hasActiveManus = tenantHasActiveManus(tenantId, integrations);
  return {
    activeManusIntegrations: activeManus.length,
    primaryManusIntegrations: activeManus.filter((r) =>
      isPrimaryCarmenLine(r, hasActiveManus),
    ).length,
  };
}
