import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database, Json } from "../../../_shared/database.types.ts";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import { entry, GROUP, history, message, STAFF_KEY } from "./group-fixtures.ts";
import type { CollectorContext } from "../types.ts";
import { collectGroupUpdates, groupUpdatesCollector } from "./collector.ts";
import type { CardEntry } from "./card-entries.ts";
import { createLlmMeter } from "./llm-meter.ts";
import type { LiveDraft } from "./live-drafts.ts";
import type { GroupHistory } from "./messages.ts";
import type { GroupUpdateSources } from "./sources.ts";

const now = new Date("2026-11-01T17:37:00Z");
const LINES = ["owner-line"];
const floor = "2026-10-30T17:37:00Z";
const busy = history([
  message("m1", "2026-11-01T08:00:00Z", "מאשר את התקציב של 4000 שח"),
  message("m2", "2026-11-01T08:05:00Z", "תודה", { key: STAFF_KEY }),
  message("m3", "2026-11-01T09:00:00Z", "אפשר להעלות את המבצע החדש?"),
  message("m4", "2026-11-01T09:30:00Z", "עולה מחר בבוקר", { key: STAFF_KEY }),
]);

/** A scheduled run's context at `now` (or a fixture run with `fixtures`). */
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
    dryRun: false,
  };
}

/**
 * Fake sources over these histories, card entries and live drafts; the model
 * answers nothing (markers decide) and each history read is recorded.
 */
function sources(
  histories: GroupHistory[],
  entries: CardEntry[] = [],
  drafts: LiveDraft[] = [],
) {
  const asked: { since: Date; lines: string[] }[] = [];
  const fake: GroupUpdateSources = {
    lines: () => Promise.resolve(LINES),
    histories: (since, lines) => {
      asked.push({ since, lines });
      return Promise.resolve(histories);
    },
    staffKeys: () =>
      Promise.resolve({
        keys: new Map([[STAFF_KEY, null]]),
        keyTenants: new Map(),
        tenantsOf: new Map(),
      }),
    cardEntries: () => Promise.resolve(entries),
    liveDrafts: () => Promise.resolve(drafts),
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
    assertEquals(asked[0].since.toISOString(), "2026-10-31T17:37:00.000Z");
    assertEquals(asked[0].lines, LINES);
    assertEquals(result.watermark, {
      floor: "2026-10-31T17:37:00.000Z",
      groups: {},
      read_lines: LINES,
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
        read_lines: LINES,
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
        read_lines: LINES,
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
      [[], { floor, groups: {}, read_lines: LINES }],
    );
  });

  await t.step(
    "a window digested again replaces its live draft, never adds one",
    async () => {
      const first = await collectGroupUpdates(
        ctx({ floor, groups: {} }),
        sources([busy]).fake,
      );
      const [old] = first.candidates;
      const draft: LiveDraft = {
        candidate: { ...old, summary_he: "ישן" },
        from: "2026-11-01T08:00:00Z",
        to: "2026-11-01T09:00:00Z",
      };
      const again = await collectGroupUpdates(
        ctx({ floor, groups: {} }),
        sources([busy], [], [draft]).fake,
      );
      assertEquals(again.candidates.length, 1);
      assertEquals(again.candidates[0].fingerprint, old.fingerprint);
      assertEquals(again.candidates[0].summary_he, old.summary_he);
    },
  );

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

const folder = new URL("./", import.meta.url);
const migration = new URL(
  "../../../../migrations/20261101103000_carmen_group_updates.sql",
  import.meta.url,
);

/** This folder's source files, tests excluded. */
async function sourceFiles(): Promise<[string, string][]> {
  const files: [string, string][] = [];
  for await (const file of Deno.readDir(folder)) {
    if (file.name.endsWith(".ts") && !file.name.endsWith(".test.ts")) {
      files.push([
        file.name,
        await Deno.readTextFile(new URL(file.name, folder)),
      ]);
    }
  }
  return files;
}

// The collector reads client groups and drafts; it never grants Carmen access
// to a group, never sends, and reads Green API rows (David's phone) only
// through the service-role function.
Deno.test("group-updates boundaries", async (t) => {
  await t.step(
    "never touches Carmen's group access or allowlists",
    async () => {
      for (const [name, text] of await sourceFiles()) {
        assert(
          !/allowed_group_ids|carmen_client_group_access/.test(text),
          name,
        );
      }
    },
  );

  await t.step("never sends and never reads chat rows directly", async () => {
    // send-kind.ts is only the send_kind vocabulary (authorship.ts reads it).
    for (const [name, text] of await sourceFiles()) {
      assert(
        !/send-(?!kind\.ts)|sendStaff|green-api|manage-manus|from\("chat_messages"\)/.test(
          text,
        ),
        name,
      );
    }
  });

  await t.step("the SQL only reads Carmen's group access", async () => {
    const sql = await Deno.readTextFile(migration);
    assertEquals(
      sql.match(
        /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.carmen_client_group_access/g,
      ),
      null,
    );
    assertEquals(/allowed_group_ids/.test(sql), false);
  });
});
