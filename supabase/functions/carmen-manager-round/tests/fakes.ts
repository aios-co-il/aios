/** In-memory ports of the round for tests: no database, no network. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import type { Collector } from "../collectors/types.ts";
import type { RoundDeps } from "../deps.ts";
import type { DeliveriesStore } from "../dispatch/store.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { RoundStateStore } from "../state/store.ts";
import { fakeDirectory } from "./fake-directory.ts";
import { delivery, finding, type World } from "./fake-world.ts";
import { resolveLive } from "./fake-resolve.ts";

export function deps(
  w: World,
  collectors: readonly Collector[] = [],
): RoundDeps {
  return {
    db: createClient<Database>("http://localhost:54321", "test-key"),
    state: stateStore(w),
    findings: findingsStore(w),
    deliveries: deliveriesStore(w),
    directory: fakeDirectory(w),
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

const LIVE = ["open", "notified", "acknowledged", "snoozed"];

function findingsStore(w: World): FindingsStore {
  return {
    upsert: (_tenant, _round, _collector, candidates) =>
      Promise.resolve(
        candidates.map((c) => {
          const live = w.findings.find(
            (f) =>
              f.kind === c.kind &&
              f.fingerprint === c.fingerprint &&
              LIVE.includes(f.status),
          );
          if (live) {
            return {
              finding_id: live.id,
              kind: c.kind,
              fingerprint: c.fingerprint,
              short_code: live.short_code,
              outcome: "seen",
            };
          }
          const row = finding({
            ...c,
            short_code: w.findings.length + 1,
            evidence: c.evidence,
          });
          w.findings.push(row);
          return {
            finding_id: row.id,
            kind: c.kind,
            fingerprint: c.fingerprint,
            short_code: row.short_code,
            outcome: "inserted",
          };
        }),
      ),
    resolve: (_tenant, _round, _collector, items) => resolveLive(w, items),
    markMissing: (_tenant, _round, scope) => {
      w.marks.push(scope);
      const missed = w.findings.filter(
        (f) =>
          f.kind === scope.kind &&
          LIVE.includes(f.status) &&
          !scope.seen.includes(f.fingerprint) &&
          (!scope.fingerprints || scope.fingerprints.includes(f.fingerprint)) &&
          (!scope.clientIds || scope.clientIds.includes(f.client_id ?? "")),
      );
      const cleared = missed.filter((f) => ++f.missed >= scope.afterMisses);
      cleared.forEach((f) => (f.status = "resolved"));
      return Promise.resolve(cleared.length);
    },
    listRoutable: (_tenant, now) =>
      w.failOn === "findings"
        ? Promise.reject(new Error("db down"))
        : Promise.resolve(
            w.findings.filter(
              (f) =>
                ["open", "notified", "snoozed"].includes(f.status) &&
                (!f.routed ||
                  (!!f.next_action_at &&
                    Date.parse(f.next_action_at) <= now.getTime())),
            ),
          ),
    listLive: (_tenant, _limit, kinds) =>
      Promise.resolve(
        w.findings.filter(
          (f) => LIVE.includes(f.status) && (!kinds || kinds.includes(f.kind)),
        ),
      ),
    byIds: (_tenant, ids) =>
      Promise.resolve(w.findings.filter((f) => ids.includes(f.id))),
    applyRoute: (tenantId, _round, decisions) => {
      w.decisions.push(...decisions);
      for (const d of decisions) {
        const f = w.findings.find((row) => row.id === d.finding_id);
        if (!f) {
          continue;
        }
        Object.assign(f, {
          status: d.status ?? f.status,
          escalation_level: d.escalation_level,
          next_action_at: d.next_action_at,
          routed: true,
          ladder_started_at: d.ladder_started_at ?? f.ladder_started_at,
        });
        for (const p of d.deliveries) {
          const row = delivery({ ...p, tenant_id: tenantId, finding_id: f.id });
          const same = w.deliveries.find(
            (r) =>
              r.finding_id === f.id &&
              r.level === p.level &&
              r.recipient_key === p.recipient_key,
          );
          if (!same) {
            w.deliveries.push(row);
          } else if (
            same.status === "cancelled" &&
            same.error === "rollout_changed"
          ) {
            Object.assign(same, { ...row, id: same.id });
          }
        }
      }
      return Promise.resolve(decisions.length);
    },
  };
}

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

function stateStore(w: World): RoundStateStore {
  return {
    listTenants: () => Promise.resolve(w.tenants),
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
