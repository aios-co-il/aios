import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { fakeDb } from "./fake-db.ts";
import { setMarketTarget } from "./set-market-target.ts";
import {
  RATIONALE,
  addPulseRow,
  ctx,
  lastPulseRow,
  seed,
  settingsOf,
} from "./test-fixtures.ts";

Deno.test(
  "set_market_target refuses a campaign measured on another goal and keeps its approved target",
  async () => {
    const db = fakeDb(
      seed({
        pulse_targets: {
          123: { cpa: 50, source: "approved", goal: "ecommerce" },
        },
      }),
    );
    addPulseRow(db, {
      campaign_key: "k123",
      campaign_id: "123",
      campaign_name: "מבצע",
      goal: "ecommerce",
    });
    const args = {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 40,
      rationale: RATIONALE,
      campaign_id: "123",
    };
    const result = await setMarketTarget(db, ctx(), { ...args, kind: "cpl" });
    assertStrictEquals(at(result, "success"), false);
    assertStrictEquals(at(result, "error"), "goal_mismatch");
    assertMatch(String(at(result, "message")), /איקומרס/);
    assertStrictEquals(db.writes.length, 0);

    // Even with a stale pulse that says "leads", the approved slot is not replaced.
    lastPulseRow(db).goal = "leads";
    const stale = await setMarketTarget(db, ctx(), args);
    assertStrictEquals(at(stale, "error"), "approved_target_exists");
    assertStrictEquals(db.writes.length, 0);
    assertEquals(at(settingsOf(db, "t-meta"), "pulse_targets", "123"), {
      cpa: 50,
      source: "approved",
      goal: "ecommerce",
    });
  },
);

Deno.test(
  "a platform market target is all or nothing across the platform's tables",
  async () => {
    const db = fakeDb(seed());
    db.tables.crm_tables.push({
      id: "t-meta-2",
      client_id: "client-1",
      tenant_id: "tenant-1",
      integration_type: "facebook_ecommerce",
      integration_settings: {
        pulse_platform_targets: { leads: { cpl: 70, source: "approved" } },
      },
    });
    const result = await setMarketTarget(db, ctx(), {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 55,
      rationale: RATIONALE,
    });
    assertStrictEquals(at(result, "success"), false);
    assertStrictEquals(at(result, "error"), "approved_target_exists");
    assertStrictEquals(at(result, "table_id"), "t-meta-2");
    assertStrictEquals(db.writes.length, 0, "t-meta is not written either");
  },
);

Deno.test(
  "a campaign market target is checked only on the tables the pulse reads the campaign from",
  async () => {
    // Two Google Ads accounts; account B holds an approved legacy CPL. The pulse
    // reads campaign g1 from account A only, so B's target never applies to it.
    const db = fakeDb(seed());
    db.tables.crm_tables.push({
      id: "t-google-b",
      client_id: "client-1",
      tenant_id: "tenant-1",
      integration_type: "google_ads",
      integration_settings: { target_cpl: 90 },
    });
    addPulseRow(db, {
      campaign_key: "kg1",
      campaign_id: "g1",
      campaign_name: "חיפוש לידים",
      table_id: "t-google",
      platform: "google",
      goal: "leads",
      read_table_ids: ["t-google"],
    });
    const market = {
      client_id: "client-1",
      platform: "google",
      goal: "leads",
      value: 60,
      rationale: RATIONALE,
    };
    const campaign = await setMarketTarget(db, ctx(), {
      ...market,
      campaign_id: "g1",
    });
    assertStrictEquals(at(campaign, "success"), true);
    assertEquals(at(campaign, "written"), [
      { table_id: "t-google", integration_type: "google_ads" },
    ]);
    assertStrictEquals(
      at(settingsOf(db, "t-google"), "pulse_targets", "g1", "cpl"),
      60,
    );
    assertEquals(
      settingsOf(db, "t-google-b"),
      { target_cpl: 90 },
      "B untouched",
    );

    // A platform target still needs every table of the client × platform free.
    const writes = db.writes.length;
    const platform = await setMarketTarget(db, ctx(), market);
    assertStrictEquals(at(platform, "error"), "approved_target_exists");
    assertStrictEquals(at(platform, "table_id"), "t-google-b");
    assertStrictEquals(db.writes.length, writes);

    // When the pulse reads the campaign from B too, B's approved target applies.
    const row = lastPulseRow(db);
    row.read_table_ids = ["t-google", "t-google-b"];
    const both = await setMarketTarget(db, ctx(), {
      ...market,
      campaign_id: "g1",
    });
    assertStrictEquals(at(both, "error"), "approved_target_exists");
    assertStrictEquals(at(both, "table_id"), "t-google-b");

    // A snapshot from before read_table_ids checks every table, as before.
    delete row.read_table_ids;
    const old = await setMarketTarget(db, ctx(), {
      ...market,
      campaign_id: "g1",
    });
    assertStrictEquals(at(old, "error"), "approved_target_exists");
    assertStrictEquals(db.writes.length, writes);
  },
);

Deno.test(
  "a campaign market target whose sampled table is gone checks every table it writes to",
  async () => {
    // The pulse sampled g1 from a table that has since been disconnected, so the
    // target would go to every Google table, and B holds an approved target for g1.
    const db = fakeDb(seed());
    db.tables.crm_tables.push({
      id: "t-google-b",
      client_id: "client-1",
      tenant_id: "tenant-1",
      integration_type: "google_ads",
      integration_settings: {
        pulse_targets: { g1: { cpl: 45, source: "approved" } },
      },
    });
    addPulseRow(db, {
      campaign_key: "kg1",
      campaign_id: "g1",
      campaign_name: "חיפוש לידים",
      table_id: "t-google-gone",
      platform: "google",
      goal: "leads",
      read_table_ids: ["t-google-gone", "t-google"],
    });
    const result = await setMarketTarget(db, ctx(), {
      client_id: "client-1",
      platform: "google",
      goal: "leads",
      value: 60,
      rationale: RATIONALE,
      campaign_id: "g1",
    });
    assertStrictEquals(at(result, "error"), "approved_target_exists");
    assertStrictEquals(at(result, "table_id"), "t-google-b");
    assertStrictEquals(db.writes.length, 0);
    assertEquals(at(settingsOf(db, "t-google-b"), "pulse_targets", "g1"), {
      cpl: 45,
      source: "approved",
    });
  },
);
