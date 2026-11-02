/** Delivery persistence: claims, outcomes, the daily cap and brief activity. */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { throwIf } from "../../_shared/manager-round/db-error.ts";
import {
  DELIVERED_STATUSES,
  type DeliveryRow,
  type DeliveryStatus,
  type Recipient,
} from "../findings/types.ts";

export type SendOutcome = {
  status: DeliveryStatus;
  messageKey?: string;
  providerMessageId?: string | null;
  error?: string | null;
  /** With status 'planned': when to try again. */
  notBefore?: Date;
};

export type DeliveriesStore = {
  /** Claims due 'now'/'list' rows (expiring stale ones first). */
  claim(tenantId: string, limit: number): Promise<DeliveryRow[]>;
  /** Alert messages (not briefs) each recipient got since `since`. */
  messagesSince(tenantId: string, since: Date): Promise<Map<string, number>>;
  /**
   * Marks claimed rows as being sent now. A claim cut off later keeps only
   * these as possibly sent; the rest of the claim goes back to planned.
   */
  markSending(tenantId: string, ids: string[]): Promise<void>;
  recordSend(
    tenantId: string,
    ids: string[],
    outcome: SendOutcome,
  ): Promise<void>;
  recordBrief(
    tenantId: string,
    findingIds: string[],
    recipient: Recipient,
    outcome: SendOutcome,
  ): Promise<void>;
  /** Findings that cleared themselves and alert messages sent since `since`. */
  activitySince(
    tenantId: string,
    since: Date,
  ): Promise<{ autoCleared: number; messages: number }>;
};

/** DeliveriesStore over the service-role client. */
export function createDeliveriesStore(db: DbClient): DeliveriesStore {
  return {
    async claim(tenantId, limit) {
      const { data, error } = await db.rpc("carmen_finding_claim_deliveries", {
        p_tenant_id: tenantId,
        p_limit: limit,
      });
      throwIf(error, "carmen_finding_claim_deliveries");
      return data ?? [];
    },

    async messagesSince(tenantId, since) {
      const rows = await deliveredMessages(db, tenantId, since);
      const keys = new Map<string, Set<string>>();
      for (const row of rows) {
        const set = keys.get(row.recipient_key) ?? new Set<string>();
        set.add(row.message_key ?? row.recipient_key);
        keys.set(row.recipient_key, set);
      }
      return new Map([...keys].map(([key, set]) => [key, set.size]));
    },

    async markSending(tenantId, ids) {
      const { error } = await db.rpc("carmen_finding_record_send", {
        p_tenant_id: tenantId,
        p_delivery_ids: ids,
        p_status: "claimed",
      });
      throwIf(error, "carmen_finding_record_send claimed");
    },

    async recordSend(tenantId, ids, outcome) {
      const { error } = await db.rpc("carmen_finding_record_send", {
        p_tenant_id: tenantId,
        p_delivery_ids: ids,
        p_status: outcome.status,
        p_message_key: outcome.messageKey,
        p_provider_message_id: outcome.providerMessageId ?? undefined,
        p_error: outcome.error ?? undefined,
        p_not_before: outcome.notBefore?.toISOString(),
      });
      throwIf(error, "carmen_finding_record_send");
    },

    async recordBrief(tenantId, findingIds, recipient, outcome) {
      const { error } = await db.rpc("carmen_finding_record_brief", {
        p_tenant_id: tenantId,
        p_finding_ids: findingIds,
        p_recipient: {
          recipient_key: recipient.key,
          recipient_user_id: recipient.user_id,
          recipient_name: recipient.name,
          recipient_phone: recipient.phone,
        },
        p_status: outcome.status,
        p_message_key: outcome.messageKey ?? crypto.randomUUID(),
        p_provider_message_id: outcome.providerMessageId ?? undefined,
        p_error: outcome.error ?? undefined,
      });
      throwIf(error, "carmen_finding_record_brief");
    },

    async activitySince(tenantId, since) {
      const { count, error } = await db
        .from("carmen_finding_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("event", "resolved")
        .eq("details->>resolution", "auto_cleared")
        .gte("created_at", since.toISOString());
      throwIf(error, "carmen_finding_events activity");
      const rows = await deliveredMessages(db, tenantId, since);
      return {
        autoCleared: count ?? 0,
        messages: new Set(rows.map((row) => row.message_key)).size,
      };
    },
  };
}

/** The tenant's alert rows (not briefs) that went out since `since`. */
async function deliveredMessages(db: DbClient, tenantId: string, since: Date) {
  const { data, error } = await db
    .from("carmen_finding_deliveries")
    .select("recipient_key, message_key")
    .eq("tenant_id", tenantId)
    .in("status", [...DELIVERED_STATUSES])
    .in("slot", ["now", "list"])
    .gte("attempted_at", since.toISOString())
    .limit(1000);
  throwIf(error, "carmen_finding_deliveries sent");
  return data ?? [];
}
