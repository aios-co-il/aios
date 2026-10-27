import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { DeliveryRow, FindingRow } from "../findings/types.ts";
import { deps } from "../tests/fakes.ts";
import { delivery, finding, TENANT, world } from "../tests/fake-world.ts";
import type { DispatchReport } from "./dispatch.ts";
import { dispatchGroup } from "./group.ts";

const settings = resolveManagerSettings({
  manager: { mode: "team", notify_since: "2026-10-01T00:00:00Z" },
});

/** Claimed rows for `count` findings of one person; `critical` marks the last one. */
function batch(count: number, slot: "now" | "list", critical = false) {
  const w = world();
  const findings = new Map<string, FindingRow>();
  const group: DeliveryRow[] = [];
  for (let i = 0; i < count; i++) {
    const f = finding({
      short_code: 10 + i,
      summary_he: `ממצא ${i}`,
      status: "notified",
      severity: critical && i === count - 1 ? "critical" : "warning",
    });
    const row = delivery({ finding_id: f.id, slot, status: "claimed" });
    findings.set(f.id, f);
    w.deliveries.push(row);
    group.push(row);
  }
  return { w, findings, group };
}

async function dispatch(
  b: ReturnType<typeof batch>,
  flags: { capped?: boolean; waiting?: boolean } = {},
  ports = deps(b.w),
) {
  const report: DispatchReport = {
    messages: 0,
    sent: 0,
    deferred: 0,
    cancelled: 0,
  };
  await dispatchGroup(
    ports,
    {
      tenantId: TENANT,
      settings,
      now: b.w.now,
      floors: {},
      briefKeys: new Set(),
      capped: flags.capped ?? false,
      waiting: flags.waiting ?? false,
    },
    { group: b.group, findings: b.findings },
    report,
  );
  return report;
}

const planned = (b: ReturnType<typeof batch>) =>
  b.w.deliveries.filter((d) => d.status === "planned").map((d) => d.not_before);

Deno.test("dispatchGroup", async (t) => {
  await t.step(
    "at most seven items, critical first; the rest is tried next round",
    async () => {
      const b = batch(9, "list", true);
      await dispatch(b);
      const lines = b.w.sent[0].message.split("\n");
      assertEquals([lines.length, lines[1]], [8, "1) #18 ממצא 8 (דחוף)"]);
      assertEquals(planned(b), [b.w.now.toISOString(), b.w.now.toISOString()]);
    },
  );

  await t.step(
    "a message's rows are marked as being sent before it leaves; the rest are not",
    async () => {
      const b = batch(8, "list");
      const ports = deps(b.w);
      const send = ports.send;
      let markedAtSend: boolean[] = [];
      ports.send = (input) => {
        markedAtSend = b.group.map((row) => row.attempted_at !== null);
        return send(input);
      };
      await dispatch(b, {}, ports);
      assertEquals(markedAtSend.filter(Boolean).length, 7);
    },
  );

  await t.step(
    "someone who just got the brief gets the rest next round",
    async () => {
      const b = batch(1, "now");
      await dispatch(b, { waiting: true });
      assertEquals([b.w.sent.length, planned(b)], [0, [b.w.now.toISOString()]]);
    },
  );

  await t.step(
    "over the daily cap a list item waits for the next list, an urgent one for the next business day",
    async () => {
      // Thursday 2026-11-05 10:00 Israel time.
      const now = new Date("2026-11-05T08:00:00Z");
      const list = batch(1, "list");
      list.w.now = now;
      const urgent = batch(1, "now");
      urgent.w.now = now;
      assertEquals((await dispatch(list, { capped: true })).deferred, 1);
      await dispatch(urgent, { capped: true });
      assertEquals(
        [
          list.w.sent.length,
          urgent.w.sent.length,
          planned(list),
          planned(urgent),
        ],
        [0, 0, ["2026-11-08T06:30:00.000Z"], ["2026-11-06T07:00:00.000Z"]],
      );
    },
  );
});
