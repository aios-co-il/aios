/** In-memory ports of the round for tests: no database, no network. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import type { Collector } from "../collectors/types.ts";
import type { RoundDeps } from "../deps.ts";
import type { DeliveriesStore } from "../dispatch/store.ts";
import type { RoundStateStore } from "../state/store.ts";
import { fakeCardDrafts } from "./fake-card-drafts.ts";
import { fakeDirectory } from "./fake-directory.ts";
import { fakeFindingsStore } from "./fake-findings.ts";
import { delivery, type World } from "./fake-world.ts";

/** The round's ports over the world `w` (sends land in `w.sent`), with these collectors registered. */
export function deps(
  w: World,
  collectors: readonly Collector[] = [],
): RoundDeps {
  return {
    db: createClient<Database>("http://localhost:54321", "test-key"),
    state: stateStore(w),
    findings: fakeFindingsStore(w),
    deliveries: deliveriesStore(w),
    directory: fakeDirectory(w),
    cardDrafts: fakeCardDrafts(w),
    send: ({ phone, message }) => {
      w.sent.push({ phone, message });
      const sent = w.sendStatus === "sent";
      return Promise.resolve({
        sent,
        status: w.sendStatus,
        transport: "manus_wa",
        integrationId: "line",
        providerMessageId: sent ? "wamid" : null,
        error: sent ? null : "x",
        phone,
      });
    },
    collectors,
    clock: () => w.now,
  };
}

/** The delivery RPCs over `w.deliveries`. */
function deliveriesStore(w: World): DeliveriesStore {
  return {
    claim: () => {
      const due = w.deliveries.filter(
        (d) =>
          d.status === "planned" &&
          d.slot !== "brief" &&
          Date.parse(d.not_before) <= w.now.getTime(),
      );
      due.forEach((d) => (d.status = "claimed"));
      return Promise.resolve(due.map((d) => ({ ...d })));
    },
    messagesSince: (_tenant, since) => {
      const counts = new Map<string, number>();
      for (const d of w.deliveries.filter(
        (row) =>
          row.status === "sent" &&
          !!row.attempted_at &&
          Date.parse(row.attempted_at) >= since.getTime(),
      )) {
        counts.set(d.recipient_key, (counts.get(d.recipient_key) ?? 0) + 1);
      }
      return Promise.resolve(counts);
    },
    markSending: (_tenant, ids) => {
      for (const d of w.deliveries.filter((row) => ids.includes(row.id))) {
        d.attempted_at = w.now.toISOString();
      }
      return Promise.resolve();
    },
    recordSend: (_tenant, ids, outcome) => {
      for (const d of w.deliveries.filter(
        (row) => ids.includes(row.id) && row.status === "claimed",
      )) {
        Object.assign(d, {
          status: outcome.status,
          not_before: outcome.notBefore?.toISOString() ?? d.not_before,
          attempted_at:
            outcome.status === "planned" ? d.attempted_at : w.now.toISOString(),
          message_key: outcome.messageKey ?? null,
        });
      }
      return Promise.resolve();
    },
    recordBrief: (tenantId, ids, recipient, outcome) => {
      ids.forEach((id) =>
        w.deliveries.push(
          delivery({
            tenant_id: tenantId,
            finding_id: id,
            level: 2,
            recipient_key: recipient.key,
            slot: "brief",
            status: outcome.status,
          }),
        ),
      );
      return Promise.resolve();
    },
    activitySince: () => Promise.resolve({ autoCleared: 2, messages: 1 }),
  };
}

/** Tenants, round state, leases and slots over `w`. */
function stateStore(w: World): RoundStateStore {
  return {
    listTenants: () => Promise.resolve(w.tenants),
    loadRules: (tenantId) =>
      Promise.resolve(
        w.tenants.find((t) => t.tenant_id === tenantId)?.pulse_alert_rules ??
          null,
      ),
    loadState: () => Promise.resolve(w.state),
    saveCollectorState: (_tenant, collector, result) => {
      const row = w.state.find((s) => s.collector === collector) ?? {
        collector,
        first_run_at: w.now.toISOString(),
        last_run_at: null,
        last_slot: null,
        watermark: null,
      };
      if (result.ok) {
        Object.assign(row, {
          last_run_at: result.at.toISOString(),
          watermark: result.watermark,
        });
      }
      w.state = [...w.state.filter((s) => s.collector !== collector), row];
      return Promise.resolve();
    },
    tryLease: (tenantId) =>
      Promise.resolve(!w.leased.has(tenantId) && !!w.leased.add(tenantId)),
    endLease: (tenantId) => Promise.resolve(void w.leased.delete(tenantId)),
    claimSlot: (_tenant, key, slot) => {
      const id = `${key}@${slot.toISOString()}`;
      return Promise.resolve(!w.slots.includes(id) && w.slots.push(id) > 0);
    },
    writeHeartbeat: (row) => {
      if (w.failOn === "heartbeat") {
        return Promise.reject(new Error("heartbeat down"));
      }
      w.heartbeats.push(row);
      return Promise.resolve();
    },
  };
}
