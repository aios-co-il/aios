import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database, Json } from "../../../_shared/database.types.ts";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import {
  entry,
  GROUP,
  history,
  message,
  STAFF_KEY,
} from "../../tests/group-fixtures.ts";
import type { CollectorContext } from "../types.ts";
import { collectGroupUpdates, groupUpdatesCollector } from "./collector.ts";
import type { CardEntry } from "./card-entries.ts";
import { createLlmMeter } from "./llm-meter.ts";
import type { GroupHistory } from "./messages.ts";
import type { GroupUpdateSources } from "./sources.ts";

const now = new Date("2026-11-01T17:37:00Z");
const floor = "2026-10-30T17:37:00Z";
const busy = history([
  message("m1", "2026-11-01T08:00:00Z", "מאשר את התקציב של 4000 שח"),
  message("m2", "2026-11-01T08:05:00Z", "תודה", { key: STAFF_KEY }),
  message("m3", "2026-11-01T09:00:00Z", "אפשר להעלות את המבצע החדש?"),
  message("m4", "2026-11-01T09:30:00Z", "עולה מחר בבוקר", { key: STAFF_KEY }),
]);

function ctx(
  watermark: Json | null,
  fixtures: Json | null = null,
): CollectorContext {
  return {
    tenantId: "t1",
    settings: resolveManagerSettings(null),
    now,
    since: new Date("2026-10-31T17:37:00Z"),
    watermark,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db: createClient<Database>("http://localhost:54321", "test-key"),
    fixtures,
  };
}

function sources(histories: GroupHistory[], entries: CardEntry[] = []) {
  const asked: Date[] = [];
  const fake: GroupUpdateSources = {
    histories: (since) => {
      asked.push(since);
      return Promise.resolve(histories);
    },
    staffKeys: () => Promise.resolve(new Set([STAFF_KEY])),
    cardEntries: () => Promise.resolve(entries),
    liveDrafts: () => Promise.resolve([]),
    summarize: {
      ask: () => Promise.resolve({ text: null, costUsd: 0.001 }),
      meter: () =>
        Promise.resolve(
          createLlmMeter({
            monthBudgetUsd: null,
            monthSpentUsd: 0,
            dailyCapUsd: 1,
            daySpentUsd: 0,
          }),
        ),
    },
  };
  return { fake, asked };
}

Deno.test("groupUpdatesCollector", async (t) => {
  await t.step(
    "one card_stale_group kind, daily at 19:30, clears on one miss",
    () => {
      assertEquals(groupUpdatesCollector.kinds, ["card_stale_group"]);
      assertEquals(groupUpdatesCollector.schedule, { cron: "30 19 * * *" });
      assertEquals(groupUpdatesCollector.clearAfterMisses, 1);
    },
  );

  await t.step("a first run reads nothing before itself", async () => {
    const { fake, asked } = sources([]);
    const result = await collectGroupUpdates(ctx(null), fake);
    assertEquals(asked[0].toISOString(), "2026-10-31T17:37:00.000Z");
    assertEquals(result.watermark, {
      floor: "2026-10-31T17:37:00.000Z",
      groups: {},
    });
  });

  await t.step(
    "a busy group with nothing on the card becomes a draft",
    async () => {
      const { fake } = sources([busy]);
      const result = await collectGroupUpdates(
        ctx({ floor, groups: {} }),
        fake,
      );
      assertEquals(
        result.candidates.map((c) => c.kind),
        ["card_stale_group"],
      );
      assertEquals(result.watermark, {
        floor,
        groups: { [GROUP]: { at: "2026-11-01T09:30:00Z", id: "m4" } },
      });
      assertEquals(result.coverage, { complete: true, clientIds: null });
      assertEquals(result.llm, { calls: 1, costUsd: 0.001 });
    },
  );

  await t.step(
    "a person's entry after the first message: only the watermark moves",
    async () => {
      const { fake } = sources(
        [busy],
        [entry("2026-11-01T12:00:00Z", "דיברתי עם הלקוח")],
      );
      const result = await collectGroupUpdates(
        ctx({ floor, groups: {} }),
        fake,
      );
      assertEquals(result.candidates, []);
      assertEquals(result.watermark, {
        floor,
        groups: { [GROUP]: { at: "2026-11-01T09:30:00Z", id: "m4" } },
      });
    },
  );

  await t.step("too little to digest: the watermark waits", async () => {
    const quiet = history([
      message("q1", "2026-11-01T08:00:00Z", "מאשר"),
      message("q2", "2026-11-01T08:01:00Z", "👍"),
    ]);
    const { fake } = sources([quiet]);
    const result = await collectGroupUpdates(ctx({ floor, groups: {} }), fake);
    assertEquals(
      [result.candidates, result.watermark],
      [[], { floor, groups: {} }],
    );
  });

  await t.step("fixtures run on the markers with no model call", async () => {
    const fixture = {
      group_updates: {
        histories: [{ ...busy, messages: busy.messages }],
        staff_keys: [STAFF_KEY],
        card_entries: [],
      },
    };
    const run = ctx({ floor, groups: {} }, fixture);
    const result = await groupUpdatesCollector.collect(run);
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].evidence.digested_by, "markers");
    assertEquals(result.llm, { calls: 0, costUsd: 0 });
  });
});
