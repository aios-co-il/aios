/** Card draft writes of the fake world: entries are recorded, findings closed. */
import type { CardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import type { World } from "./fake-world.ts";

const LIVE = ["open", "notified", "acknowledged", "snoozed"];

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
    resolveWritten(_tenant, findingId) {
      const finding = w.findings.find(
        (f) => f.id === findingId && LIVE.includes(f.status),
      );
      if (finding) {
        finding.status = "resolved";
      }
      return Promise.resolve(!!finding);
    },
  };
}
