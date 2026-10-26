import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  buildSyncOutcome,
  finalizeSyncOutcome,
  planLevelWrite,
  redactSyncError,
  scheduledMarkerPatch,
} from "./sync-outcome.ts";
import {
  resolveSyncOutcome,
  syncOutcomeProblem,
  worstSyncProblem,
} from "./sync-freshness.ts";
import { isSyncStale } from "./campaign-pulse.ts";
import { saveSyncRun, type SyncDbClient } from "./ads-sync-write.ts";
import { fakeClient } from "./tests/fake-postgrest.ts";
import { RUN_AT, storedTable } from "./tests/meta-graph-fixtures.ts";

const NOW = Date.parse("2026-10-26T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

Deno.test("planLevelWrite: a failed campaign level aborts the window", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 0, adset: 40, ad: 120 },
    levelErrors: { campaign: "(#17) User request limit reached" },
  });
  assertStrictEquals(plan.write, false);
  assertStrictEquals(plan.status, "failed");
  assertEquals(plan.levelsOk, ["adset", "ad"]);
  assertMatch(plan.error || "", /campaign level fetch failed/);
});

Deno.test(
  "planLevelWrite: a failed ad set / ad level is partial and skips that level",
  () => {
    const plan = planLevelWrite({
      levelCounts: { campaign: 14, adset: 30, ad: 0 },
      levelErrors: { ad: "Please reduce the amount of data" },
    });
    assertStrictEquals(plan.write, true);
    assertStrictEquals(plan.status, "partial");
    assertEquals(plan.levelsOk, ["campaign", "adset"]);
    assertStrictEquals(plan.rows, 44);
  },
);

Deno.test(
  "planLevelWrite: nothing fetched is empty, even when a lower level errored",
  () => {
    assertEquals(
      planLevelWrite({ levelCounts: { campaign: 0, adset: 0, ad: 0 } }),
      {
        write: false,
        status: "empty",
        levelsOk: ["campaign", "adset", "ad"],
        rows: 0,
      },
    );
    // A clean, empty campaign level already proves there was no delivery.
    assertEquals(
      planLevelWrite({
        levelCounts: { campaign: 0, adset: 0, ad: 0 },
        levelErrors: { adset: "timeout" },
      }),
      { write: false, status: "empty", levelsOk: ["campaign", "ad"], rows: 0 },
    );
    // Without a campaign level to vouch for it, a failed level is a failed run.
    const failed = planLevelWrite({
      levels: ["adset", "ad"],
      levelCounts: { adset: 0, ad: 0 },
      levelErrors: { adset: "timeout" },
    });
    assertStrictEquals(failed.write, false);
    assertStrictEquals(failed.status, "failed");
  },
);

Deno.test(
  "planLevelWrite: lower levels without campaign rows never replace the window",
  () => {
    const plan = planLevelWrite({
      levelCounts: { campaign: 0, adset: 5, ad: 9 },
    });
    assertStrictEquals(plan.write, false);
    assertStrictEquals(plan.status, "failed");
  },
);

Deno.test("planLevelWrite: a clean fetch is ok over every level", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 7, adset: 0, ad: 0 },
  });
  assertStrictEquals(plan.write, true);
  assertStrictEquals(plan.status, "ok");
  assertEquals(plan.levelsOk, ["campaign", "adset", "ad"]);
});

Deno.test(
  "finalizeSyncOutcome: a write error turns the run into failed",
  () => {
    const plan = planLevelWrite({ levelCounts: { campaign: 600 } });
    const at = "2026-10-26T04:40:00.000Z";
    assertEquals(
      finalizeSyncOutcome(
        plan,
        { inserted: 500, error: "insert: timeout" },
        { at },
      ),
      {
        status: "failed",
        rows: 500,
        levels_ok: ["campaign", "adset", "ad"],
        error: "insert: timeout",
        at,
      },
    );
    assertStrictEquals(
      finalizeSyncOutcome(plan, { inserted: 600 }, { at }).status,
      "ok",
    );
  },
);

Deno.test(
  "scheduledMarkerPatch: markers advance only past a successful write",
  () => {
    const markers = {
      scheduled_history_from: "2026-06-28",
      scheduled_synced_through: "2026-10-26",
      scheduled_lookback_on: "2026-10-26",
    };
    assertEquals(scheduledMarkerPatch("failed", markers), {});
    assertEquals(scheduledMarkerPatch("empty", markers), {
      scheduled_history_from: "2026-06-28",
    });
    assertEquals(scheduledMarkerPatch("partial", markers), markers);
    assertEquals(
      scheduledMarkerPatch("ok", { scheduled_synced_through: "bad" }),
      {},
    );
  },
);

Deno.test(
  "syncOutcomeProblem: an empty or failed latest run is a problem",
  () => {
    const lastWrite = iso(NOW - 20 * HOUR);
    for (const status of ["empty", "failed"] as const) {
      const table = {
        last_sync_at: lastWrite,
        last_sync_outcome: buildSyncOutcome({ status, at: iso(NOW - HOUR) }),
      };
      assertStrictEquals(syncOutcomeProblem(table), status);
    }
    assertStrictEquals(
      syncOutcomeProblem({
        last_sync_at: iso(NOW - HOUR),
        last_sync_outcome: buildSyncOutcome({
          status: "partial",
          at: iso(NOW - HOUR),
        }),
      }),
      null,
    );
  },
);

Deno.test(
  "syncOutcomeProblem: an outcome older than the last write is ignored",
  () => {
    assertStrictEquals(
      syncOutcomeProblem({
        last_sync_at: iso(NOW - HOUR),
        integration_settings: {
          last_sync_outcome: {
            status: "failed",
            rows: 0,
            at: iso(NOW - 5 * HOUR),
          },
        },
      }),
      null,
    );
  },
);

Deno.test(
  "resolveSyncOutcome: the newer of column and settings mirror wins",
  () => {
    const outcome = resolveSyncOutcome({
      last_sync_outcome: { status: "ok", rows: 3, at: iso(NOW - 3 * HOUR) },
      integration_settings: {
        last_sync_outcome: { status: "empty", rows: 0, at: iso(NOW - HOUR) },
      },
    });
    assertStrictEquals(outcome?.status, "empty");
    assertStrictEquals(
      resolveSyncOutcome({ last_sync_outcome: { status: "x" } }),
      null,
    );
  },
);

Deno.test(
  "isSyncStale: a fresh last_sync_at with an empty latest run is stale",
  () => {
    const fresh = iso(NOW - 2 * HOUR);
    assertStrictEquals(isSyncStale({ last_sync_at: fresh }, NOW), false);
    assertStrictEquals(
      isSyncStale(
        {
          last_sync_at: fresh,
          integration_settings: {
            last_sync_at: fresh,
            last_sync_outcome: {
              status: "empty",
              rows: 0,
              at: iso(NOW - HOUR),
            },
          },
        },
        NOW,
      ),
      true,
    );
    assertStrictEquals(
      isSyncStale(
        {
          last_sync_at: fresh,
          last_sync_outcome: { status: "failed", rows: 0, at: iso(NOW - HOUR) },
        },
        NOW,
      ),
      true,
    );
  },
);

Deno.test("worstSyncProblem: failed beats empty", () => {
  assertStrictEquals(worstSyncProblem([null, "empty", "failed"]), "failed");
  assertStrictEquals(worstSyncProblem([null, "empty"]), "empty");
  assertStrictEquals(worstSyncProblem([]), null);
});

// Meta puts the access token in the request URL; Deno's transport errors print it.
const TOKEN = "EAAB123abcDEF456ghiJKL789mnoPQR012stuVWX345yz";
const denoSendError = (url: string) =>
  `error sending request for url (${url}): client error (SendRequest): connection closed before message completed`;
const FIRST_PAGE_URL = `https://graph.facebook.com/v21.0/act_123/insights?access_token=${TOKEN}&level=ad&fields=campaign_id,spend&time_increment=1`;
// paging.next: the token follows the `?` directly.
const NEXT_PAGE_URL = `https://graph.facebook.com/v21.0/act_123/insights?access_token=${TOKEN}&after=QVFIUjZA`;

Deno.test(
  "redactSyncError: removes Meta and Google credentials and is idempotent",
  () => {
    const cases = [
      denoSendError(FIRST_PAGE_URL),
      denoSendError(NEXT_PAGE_URL),
      `https://graph.facebook.com/v21.0/act_123?fields=account_status&access_token=${TOKEN}`,
      `{"error":"invalid","access_token": "${TOKEN}"}`,
      `request failed: Authorization: Bearer ya29.a0AfB_byC-xyz.123`,
      `token ${TOKEN} expired`,
    ];
    for (const text of cases) {
      const redacted = redactSyncError(text);
      assertStrictEquals(redacted.includes(TOKEN), false, redacted);
      assertStrictEquals(redacted.includes("ya29."), false, redacted);
      assertMatch(redacted, /\[redacted\]/);
      assertStrictEquals(redactSyncError(redacted), redacted);
    }
    assertStrictEquals(
      redactSyncError(denoSendError(FIRST_PAGE_URL)),
      "error sending request for url (https://graph.facebook.com/v21.0/act_123/insights?[redacted]): client error (SendRequest): connection closed before message completed",
    );
    assertStrictEquals(
      redactSyncError("(#17) User request limit reached"),
      "(#17) User request limit reached",
    );
  },
);

Deno.test("buildSyncOutcome: redacts before the 300-char cut", () => {
  // The cut lands inside the token: truncating first would keep its first half.
  const prefix = "x".repeat(250);
  const outcome = buildSyncOutcome({
    status: "failed",
    error: `${prefix} access_token=${TOKEN}&level=campaign`,
  });
  assertStrictEquals(outcome.error?.includes(TOKEN.slice(0, 20)), false);
  assertMatch(outcome.error || "", /access_token=\[redacted\]/);
});

Deno.test(
  "a token in a level error reaches neither the outcome nor the settings mirror",
  async () => {
    const partial = finalizeSyncOutcome(
      planLevelWrite({
        levelCounts: { campaign: 4, adset: 6, ad: 0 },
        levelErrors: { ad: denoSendError(NEXT_PAGE_URL) },
      }),
      { inserted: 10 },
      { at: RUN_AT, source: "test" },
    );
    const failed = finalizeSyncOutcome(
      planLevelWrite({
        levelCounts: { campaign: 0, adset: 6, ad: 9 },
        levelErrors: { campaign: denoSendError(FIRST_PAGE_URL) },
      }),
      null,
      { at: RUN_AT, source: "test" },
    );
    assertStrictEquals(partial.status, "partial");
    assertStrictEquals(failed.status, "failed");

    for (const outcome of [partial, failed]) {
      assertStrictEquals(JSON.stringify(outcome).includes(TOKEN), false);
      assertMatch(outcome.error || "", /\[redacted\]/);

      const db = storedTable();
      const client = fakeClient(db) as unknown as SyncDbClient;
      // Also a caller that built its outcome by hand, without buildSyncOutcome.
      const raw = { ...outcome, error: denoSendError(FIRST_PAGE_URL) };
      for (const candidate of [outcome, raw]) {
        await saveSyncRun(client, "t1", { outcome: candidate, log: () => {} });
        const table = db.tables.crm_tables[0];
        const settings = table.integration_settings as Record<string, unknown>;
        const mirror = settings.last_sync_outcome as Record<string, unknown>;
        const column = table.last_sync_outcome as Record<string, unknown>;

        assertStrictEquals(JSON.stringify(table).includes(TOKEN), false);
        assertStrictEquals("error" in mirror, false);
        assertEquals(Object.keys(mirror).sort(), [
          "at",
          "levels_ok",
          "rows",
          "source",
          "status",
        ]);
        assertStrictEquals(mirror.status, outcome.status);
        assertMatch(String(column.error), /\[redacted\]/);
        // The stale check still reads the status from the mirror.
        assertStrictEquals(
          resolveSyncOutcome({ integration_settings: settings })?.status,
          outcome.status,
        );
      }
    }
  },
);

Deno.test(
  "redacts percent-encoded, single-quoted and hyphenated credentials",
  () => {
    const encoded = redactSyncError(
      "fetch failed: https%3A%2F%2Fgraph.facebook.com%2Fv21.0%2Fact_1%2Finsights%3Faccess_token%3DEAAB1234567890abcdefghijklmnop",
    );
    assertNotMatch(encoded, /EAAB1234567890/);
    const quoted = redactSyncError("{'access_token': 'secret-value-1'}");
    assertNotMatch(quoted, /secret-value-1/);
    const hyphen = redactSyncError("developer-token: dev-secret-2");
    assertNotMatch(hyphen, /dev-secret-2/);
    assertStrictEquals(redactSyncError(redactSyncError(encoded)), encoded);
  },
);
