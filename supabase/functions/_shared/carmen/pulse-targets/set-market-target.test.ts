import {
  assertEquals,
  assertMatch,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { fakeDb } from "./fake-db.ts";
import { setMarketTarget } from "./set-market-target.ts";
import { NOW, RATIONALE, ctx, seed, settingsOf } from "./test-fixtures.ts";

const LEADS_TARGET = {
  client_id: "client-1",
  platform: "meta",
  goal: "leads",
  rationale: RATIONALE,
};

Deno.test("set_market_target never overwrites an approved target", async () => {
  const db = fakeDb(seed({ pulse_platform_targets: { leads: { cpl: 70 } } }));
  db.tables.crm_tables = db.tables.crm_tables.filter((t) => t.id === "t-meta");
  const result = await setMarketTarget(db, ctx(), {
    ...LEADS_TARGET,
    value: 55,
  });
  assertStrictEquals(at(result, "success"), false);
  assertStrictEquals(at(result, "error"), "approved_target_exists");
  assertStrictEquals(at(result, "existing", "value"), 70);
  assertStrictEquals(db.writes.length, 0);

  // A campaign inherits the approved platform target, so it is refused too.
  const campaign = await setMarketTarget(db, ctx(), {
    ...LEADS_TARGET,
    value: 55,
    campaign_id: "c1",
  });
  assertStrictEquals(at(campaign, "error"), "approved_target_exists");
  assertStrictEquals(db.writes.length, 0);
});

Deno.test(
  "set_market_target writes a labelled carmen_market target with rationale and time",
  async () => {
    const db = fakeDb(seed());
    const result = await setMarketTarget(
      db,
      ctx({ actorUserId: null }), // Carmen on her own may set a market target
      { ...LEADS_TARGET, value: 60, campaign_id: "c1" },
    );
    assertStrictEquals(at(result, "success"), true);
    assertStrictEquals(at(result, "label"), "יעד שוק (כרמן)");
    assertStrictEquals(at(result, "scope"), "campaign");
    assertEquals(at(settingsOf(db, "t-meta"), "pulse_targets", "c1"), {
      cpl: 60,
      source: "carmen_market",
      rationale: RATIONALE,
      set_at: NOW.toISOString(),
      set_by: "carmen",
      goal: "leads",
    });
    assertStrictEquals(
      at(settingsOf(db, "t-meta"), "last_sync_at"),
      "2026-10-26",
    );
    assertEquals(settingsOf(db, "t-google"), {}, "other platform untouched");
    assertEquals(db.writes[0].filters, ["id", "tenant_id"]);
  },
);

Deno.test(
  "set_market_target needs a real rationale and client access",
  async () => {
    const db = fakeDb(seed());
    const short = await setMarketTarget(db, ctx(), {
      ...LEADS_TARGET,
      value: 60,
      rationale: "שוק",
    });
    assertStrictEquals(at(short, "error"), "rationale_required");
    const denied = await assertRejects(() =>
      setMarketTarget(
        db,
        ctx({
          assertClientAccess: async () => {
            throw new Error("אין הרשאה ללקוח");
          },
        }),
        { ...LEADS_TARGET, value: 60 },
      ),
    );
    assertMatch(String(denied), /אין הרשאה/);
    assertStrictEquals(db.writes.length, 0);
  },
);

Deno.test(
  "set_market_target fails loudly when the pulse snapshot cannot be read",
  async () => {
    // A failed read used to look like "no pulse": no baseline range check and
    // "campaign_not_in_pulse".
    const db = fakeDb(seed(), {
      table: "campaign_pulse_snapshots",
      op: "select",
    });
    await assertRejects(
      () => setMarketTarget(db, ctx(), { ...LEADS_TARGET, value: 60 }),
      Error,
      "campaign_pulse_snapshots select failed",
    );
    assertStrictEquals(db.writes.length, 0);
  },
);

Deno.test(
  "a failed table write stops set_market_target and says what was written",
  async () => {
    const db = fakeDb(seed(), { table: "crm_tables", op: "update" });
    const result = await setMarketTarget(db, ctx(), {
      ...LEADS_TARGET,
      value: 60,
    });
    assertStrictEquals(at(result, "success"), false);
    assertStrictEquals(at(result, "error"), "crm_tables update failed");
    assertEquals(at(result, "written_before_error"), []);
  },
);
