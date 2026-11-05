import { assertEquals } from "jsr:@std/assert@1";
import { BRIEF_STATE_PREFIX } from "../brief/send.ts";
import { ROUTER_COLLECTOR, ROUTER_KINDS } from "../recipients/data-findings.ts";
import { ROUND_STATE_KEY, type RoundStateRow } from "../state/store.ts";
import { COLLECTORS, dueCollectors } from "./registry.ts";
import type { Collector } from "./types.ts";

const collect: Collector["collect"] = () =>
  Promise.resolve({
    candidates: [],
    watermark: null,
    coverage: { complete: true, clientIds: null },
  });
const hourly: Collector = {
  id: "hourly",
  kinds: ["no_contact"],
  detectorVersion: "1",
  schedule: { cron: "0 * * * *" },
  collect,
};
const onData: Collector = {
  id: "on_data",
  kinds: ["data_gap"],
  detectorVersion: "1",
  schedule: { trigger: () => Promise.resolve(true) },
  collect,
};
const fixture: Collector = { ...hourly, id: "self_test", fixturesOnly: true };
const all = [hourly, onData, fixture];
const now = new Date("2026-11-01T08:10:00Z");
const none = { collectorIds: null, fixtures: null };
/** The hourly collector's state with this last slot. */
const state = (last_slot: string | null): RoundStateRow[] => [
  {
    collector: "hourly",
    first_run_at: "2026-10-01T00:00:00Z",
    last_run_at: null,
    last_slot,
    watermark: null,
  },
];
/** Each due collector as `id@slot`. */
const ids = (due: ReturnType<typeof dueCollectors>) =>
  due.map((d) => `${d.collector.id}@${d.slot?.toISOString() ?? "-"}`);

Deno.test("dueCollectors", async (t) => {
  await t.step(
    "a fresh cron slot not yet run; triggers always; fixtures-only skipped",
    () => {
      assertEquals(ids(dueCollectors(all, [], now, none)), [
        "hourly@2026-11-01T08:00:00.000Z",
        "on_data@-",
      ]);
    },
  );

  await t.step("a slot already run or gone stale is not replayed", () => {
    assertEquals(
      ids(dueCollectors([hourly], state("2026-11-01T08:00:00Z"), now, none)),
      [],
    );
    assertEquals(
      ids(
        dueCollectors(
          [{ ...hourly, schedule: { cron: "0 6 * * *", staleMinutes: 30 } }],
          [],
          now,
          none,
        ),
      ),
      [],
    );
  });

  await t.step(
    "named collectors are forced; a fixture runs its collector",
    () => {
      assertEquals(
        ids(
          dueCollectors(all, state("2026-11-01T08:00:00Z"), now, {
            collectorIds: ["hourly"],
            fixtures: null,
          }),
        ),
        ["hourly@-"],
      );
      assertEquals(
        ids(
          dueCollectors(all, [], now, {
            collectorIds: null,
            fixtures: { self_test: [] },
          }),
        ).includes("self_test@-"),
        true,
      );
    },
  );
});

Deno.test("COLLECTORS", async (t) => {
  const real = COLLECTORS.filter((collector) => !collector.fixturesOnly);

  await t.step("no collector id takes a key the round itself stores", () => {
    const clashes = COLLECTORS.filter(
      (collector) =>
        [ROUND_STATE_KEY, ROUTER_COLLECTOR.id].includes(collector.id) ||
        collector.id.startsWith(BRIEF_STATE_PREFIX),
    );
    assertEquals(clashes, []);
  });

  // Auto-clear is scoped by kind: two collectors sharing a kind would clear
  // each other's findings and re-alert every cycle.
  await t.step("each kind has one collector, and none the router's", () => {
    const kinds = real.flatMap((collector) => [...collector.kinds]);
    assertEquals(kinds.length, new Set(kinds).size);
    assertEquals(
      kinds.filter((kind) =>
        ROUTER_KINDS.some((routerKind) => routerKind === kind),
      ),
      [],
    );
  });
});
