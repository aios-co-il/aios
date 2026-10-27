/** In-memory findings RPCs for the round's tests. */
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { UpsertOutcome } from "../findings/types.ts";
import { resolveLive } from "./fake-resolve.ts";
import { delivery, finding, type World } from "./fake-world.ts";

const LIVE: readonly string[] = FINDING_LIVE_STATUSES;

/** The findings RPCs over `w.findings` (`w.refused` fingerprints are reported, not stored). */
export function fakeFindingsStore(w: World): FindingsStore {
  return {
    upsert: (_tenant, _round, _collector, candidates) =>
      Promise.resolve(
        candidates.map((c): UpsertOutcome => {
          const refused = w.refused[c.fingerprint];
          if (refused) {
            return {
              finding_id: null,
              kind: c.kind,
              fingerprint: c.fingerprint,
              short_code: null,
              outcome: refused,
            };
          }
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
