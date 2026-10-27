/**
 * Round state: which tenants to run, per-tenant collector state, the round
 * lease, schedule slots and the heartbeat_logs row of a tenant run.
 */
import type {
  Json,
  Tables,
  TablesInsert,
} from "../../_shared/database.types.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { throwIf } from "../db-error.ts";

export type TenantRow = {
  tenant_id: string;
  pulse_alert_rules: Json | null;
  /** Last finished round for the tenant, so starved tenants go first. */
  last_run_at: string | null;
};

export type RoundStateRow = Pick<
  Tables<"carmen_round_state">,
  "collector" | "first_run_at" | "last_run_at" | "last_slot" | "watermark"
>;

/** State row of the per-tenant lease; its first_run_at floors router-made kinds. */
export const ROUND_STATE_KEY = "_round";

export type RoundStateStore = {
  listTenants(): Promise<TenantRow[]>;
  loadState(tenantId: string): Promise<RoundStateRow[]>;
  /** Success stores the watermark and run time; failure only the error. */
  saveCollectorState(
    tenantId: string,
    collector: string,
    result:
      | { ok: true; watermark: Json | null; at: Date }
      | { ok: false; error: string },
  ): Promise<void>;
  tryLease(tenantId: string, seconds: number): Promise<boolean>;
  endLease(tenantId: string, error: string | null): Promise<void>;
  claimSlot(tenantId: string, key: string, slot: Date): Promise<boolean>;
  writeHeartbeat(row: TablesInsert<"heartbeat_logs">): Promise<void>;
};

/** Active and trial tenants run; suspended and inactive ones do not. */
const RUNNING_TENANT_STATUSES = ["active", "trial"] as const;

/** RoundStateStore over the service-role client. */
export function createRoundStateStore(db: DbClient): RoundStateStore {
  return {
    async listTenants() {
      const [tenants, settings, rounds] = await Promise.all([
        db
          .from("tenants")
          .select("id")
          .in("status", [...RUNNING_TENANT_STATUSES]),
        // No unique key on tenant_id: oldest first, so the newest row wins below.
        db
          .from("tenant_heartbeat_settings")
          .select("tenant_id, pulse_alert_rules")
          .order("updated_at", { ascending: true }),
        db
          .from("carmen_round_state")
          .select("tenant_id, last_run_at")
          .eq("collector", ROUND_STATE_KEY),
      ]);
      throwIf(tenants.error, "tenants");
      throwIf(settings.error, "tenant_heartbeat_settings");
      throwIf(rounds.error, "carmen_round_state");
      const rules = new Map(
        (settings.data ?? []).map((row) => [
          row.tenant_id,
          row.pulse_alert_rules,
        ]),
      );
      const lastRun = new Map(
        (rounds.data ?? []).map((row) => [row.tenant_id, row.last_run_at]),
      );
      return (tenants.data ?? []).map((tenant) => ({
        tenant_id: tenant.id,
        pulse_alert_rules: rules.get(tenant.id) ?? null,
        last_run_at: lastRun.get(tenant.id) ?? null,
      }));
    },

    async loadState(tenantId) {
      const { data, error } = await db
        .from("carmen_round_state")
        .select("collector, first_run_at, last_run_at, last_slot, watermark")
        .eq("tenant_id", tenantId);
      throwIf(error, "carmen_round_state load");
      return data ?? [];
    },

    async saveCollectorState(tenantId, collector, result) {
      const row: TablesInsert<"carmen_round_state"> = result.ok
        ? {
            tenant_id: tenantId,
            collector,
            last_run_at: result.at.toISOString(),
            watermark: result.watermark,
            last_error: null,
          }
        : {
            tenant_id: tenantId,
            collector,
            last_error: result.error.slice(0, 500),
          };
      const { error } = await db
        .from("carmen_round_state")
        .upsert(
          { ...row, updated_at: new Date().toISOString() },
          { onConflict: "tenant_id,collector" },
        );
      throwIf(error, "carmen_round_state save");
    },

    async tryLease(tenantId, seconds) {
      const { data, error } = await db.rpc("carmen_round_try_lease", {
        p_tenant_id: tenantId,
        p_seconds: seconds,
      });
      throwIf(error, "carmen_round_try_lease");
      return data === true;
    },

    async endLease(tenantId, failure) {
      const { error } = await db.rpc("carmen_round_end_lease", {
        p_tenant_id: tenantId,
        p_error: failure ?? undefined,
      });
      throwIf(error, "carmen_round_end_lease");
    },

    async claimSlot(tenantId, key, slot) {
      const { data, error } = await db.rpc("carmen_round_claim_slot", {
        p_tenant_id: tenantId,
        p_key: key,
        p_slot: slot.toISOString(),
      });
      throwIf(error, "carmen_round_claim_slot");
      return data === true;
    },

    async writeHeartbeat(row) {
      const { error } = await db.from("heartbeat_logs").insert(row);
      throwIf(error, "heartbeat_logs");
    },
  };
}
