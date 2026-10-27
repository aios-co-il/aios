import { assertEquals } from "jsr:@std/assert@1";
import type { RoundStateRow } from "../state/store.ts";
import { dueCollectors } from "./registry.ts";
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
const state = (last_slot: string | null): RoundStateRow[] => [
  {
    collector: "hourly",
    first_run_at: "2026-10-01T00:00:00Z",
    last_run_at: null,
    last_slot,
    watermark: null,
  },
];
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
