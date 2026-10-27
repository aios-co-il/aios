/** Card draft writes of the fake world: entries are recorded, findings closed. */
import type { CardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import { TENANT, type World } from "./fake-world.ts";

const LIVE: readonly string[] = FINDING_LIVE_STATUSES;

/**
 * The ports over `w`: an entry is deduplicated on client, source and
 * source_ref (record_client_card_entry), and closing a live finding of TENANT
 * cancels its planned deliveries, as carmen_finding_resolve_card_written does.
 * `w.failOn === "card"` refuses every entry.
 */
export function fakeCardDrafts(w: World): CardDraftWritePorts {
  return {
    writeEntry(input) {
      if (w.failOn === "card") {
        return Promise.reject(new Error("card write refused"));
      }
      const same = w.cardEntries.find(
        (entry) =>
          entry.clientId === input.clientId &&
          entry.source === input.source &&
          entry.sourceRef === input.sourceRef,
      );
      if (!same) {
        w.cardEntries.push(input);
      }
      return Promise.resolve({
        entryId: `entry:${input.sourceRef}`,
        inserted: !same,
        userId: "campaigner-user",
        attribution: "campaigner",
      });
    },
    resolveWritten(tenantId, findingId) {
      const finding = w.findings.find(
        (f) =>
          tenantId === TENANT && f.id === findingId && LIVE.includes(f.status),
      );
      if (!finding) {
        return Promise.resolve(false);
      }
      finding.status = "resolved";
      for (const row of w.deliveries) {
        if (
          row.tenant_id === tenantId &&
          row.finding_id === findingId &&
          row.status === "planned"
        ) {
          row.status = "cancelled";
        }
      }
      return Promise.resolve(true);
    },
  };
}
