/**
 * Who a tenant's notify goes out as, per Carmen automation: the connection
 * each automation last spoke on (to prefer that user's lines), the user each
 * step's send goes out as, and which of those are super admins (who may send
 * from any line). DB reads only; a failed lookup throws.
 */

import { isSuperAdminUser } from "../_shared/auth/tenant-access.ts";
import type { NotifyBridgeSession } from "../_shared/carmen-notify-target.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { CarmenSendSetup } from "./send-setup.ts";

export type NotifySenders = {
  connectionUserIds: Record<string, string>;
  senderUserIds: Record<string, string | null>;
  superAdminUserIds: string[];
};

/** The connection users, step senders and super-admin senders of the tenant's Carmen automations. */
export async function loadNotifySenders(
  sb: Pick<DbClient, "rpc">,
  tenantId: string,
  sessions: NotifyBridgeSession[],
  bridge: NotifyBridgeSession | null,
  setup: CarmenSendSetup,
): Promise<NotifySenders> {
  const senderUserIds = sendersByAutomation(sessions, bridge, setup);
  return {
    connectionUserIds: connectionUsersByAutomation(sessions, bridge),
    senderUserIds,
    superAdminUserIds: await superAdminSenders(
      sb,
      tenantId,
      setup,
      senderUserIds,
    ),
  };
}

/**
 * The connection each automation last spoke on: the bridge session's for the
 * bridge automation, else that automation's latest session.
 */
function connectionUsersByAutomation(
  sessions: NotifyBridgeSession[],
  bridge: NotifyBridgeSession | null,
): Record<string, string> {
  const ids: Record<string, string> = {};
  if (bridge?.automation_id && bridge.connection_user_id) {
    ids[bridge.automation_id] = bridge.connection_user_id;
  }
  for (const s of sessions) {
    if (s.automation_id && s.connection_user_id) {
      ids[s.automation_id] ??= s.connection_user_id;
    }
  }
  return ids;
}

/** Who each step automation's send goes out as: its latest session's connection user, else the bridge session's. */
function sendersByAutomation(
  sessions: NotifyBridgeSession[],
  bridge: NotifyBridgeSession | null,
  setup: CarmenSendSetup,
): Record<string, string | null> {
  const senders: Record<string, string | null> = {};
  for (const { automation_id } of setup.steps) {
    const session = sessions.find(
      (s) => s.automation_id === automation_id && !!s.connection_user_id,
    );
    senders[automation_id] =
      session?.connection_user_id || bridge?.connection_user_id || null;
  }
  return senders;
}

/**
 * The possible senders who are super admins. Looked up only when a step names
 * another tenant's line that is not shared, the one case it decides: a super
 * admin may send from any line (mayUseLine, _shared/auth/tenant-access.ts).
 */
async function superAdminSenders(
  sb: Pick<DbClient, "rpc">,
  tenantId: string,
  setup: CarmenSendSetup,
  senderUserIds: Record<string, string | null>,
): Promise<string[]> {
  const unshared = setup.integrations.filter(
    (r) => r.tenant_id !== tenantId && !setup.sharedLineIds.includes(r.id),
  );
  if (!unshared.length) {
    return [];
  }
  const candidates = [
    ...new Set(
      [
        ...Object.values(senderUserIds),
        ...unshared.map((r) => r.user_id),
      ].filter((id): id is string => !!id),
    ),
  ];
  const flags = await Promise.all(
    candidates.map((id) => isSuperAdminUser(sb, id)),
  );
  return candidates.filter((_, i) => flags[i]);
}
