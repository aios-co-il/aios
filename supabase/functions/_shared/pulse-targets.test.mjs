import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPulseTargetPatch,
  canSetMarketTarget,
  listCampaignsWithoutTarget,
  pulseTargetSourceLabel,
  resolvePulseTarget,
  summarizePulseTargets,
} from "./pulse-targets.mjs";

test("a target without a source is approved; carmen_market is labelled", () => {
  const settings = {
    pulse_platform_targets: { leads: { cpl: 80 } },
    pulse_targets: {
      c1: {
        cpl: 60,
        source: "carmen_market",
        rationale: "ענף עורכי דין בישראל ₪60–90 לליד; ממוצע הלקוח ₪58",
      },
    },
  };
  const platform = resolvePulseTarget(settings, "leads", null);
  assert.equal(platform.source, "approved");
  assert.equal(platform.scope, "platform");
  const campaign = resolvePulseTarget(settings, "leads", { campaignId: "c1" });
  assert.equal(campaign.value, 60);
  assert.equal(campaign.source, "carmen_market");
  assert.match(campaign.rationale, /עורכי דין/);
  assert.equal(pulseTargetSourceLabel(campaign.source), "יעד שוק (כרמן)");
  assert.equal(pulseTargetSourceLabel(undefined), "יעד מאושר");
});

test("precedence: campaign → platform → pulse_targets.default → table fields", () => {
  const settings = {
    target_cpl: 120,
    pulse_targets: { default: { cpl: 100 }, Leads: { cpl: 50 } },
    pulse_platform_targets: { leads: { cpl: 70 } },
  };
  assert.equal(
    resolvePulseTarget(settings, "leads", { campaignName: "Leads" }).value,
    50,
  );
  assert.equal(
    resolvePulseTarget(settings, "leads", { campaignId: "x" }).value,
    70,
  );
  delete settings.pulse_platform_targets;
  assert.equal(resolvePulseTarget(settings, "leads", null).value, 100);
  delete settings.pulse_targets;
  const table = resolvePulseTarget(settings, "leads", null);
  assert.equal(table.value, 120);
  assert.equal(table.scope, "table");
  assert.equal(table.source, "approved");
});

test("a campaign's own CPA beats the platform ROAS (most specific place wins)", () => {
  const target = resolvePulseTarget(
    {
      pulse_platform_targets: { ecommerce: { roas: 3 } },
      pulse_targets: { shop: { cpa: 90 } },
    },
    "ecommerce",
    { campaignId: "shop" },
  );
  assert.equal(target.kind, "cpa");
  assert.equal(target.direction, "maximum");
});

test("legacy campaign_targets is read and carried over on the first write", () => {
  const legacy = { campaign_targets: { old: { cpl: 40 } } };
  assert.equal(
    resolvePulseTarget(legacy, "leads", { campaignId: "old" }).value,
    40,
  );
  const next = buildPulseTargetPatch(legacy, {
    goal: "leads",
    value: 55,
    campaignId: "new",
  });
  assert.equal(next.pulse_targets.old.cpl, 40);
  assert.equal(next.pulse_targets.new.cpl, 55);
});

test("an approved save replaces Carmen's market target and drops its rationale", () => {
  const market = buildPulseTargetPatch(
    { last_sync_at: "2026-10-25" },
    {
      goal: "ecommerce",
      kind: "roas",
      value: 2.5,
      source: "carmen_market",
      rationale: "ענף אופנה בישראל ROAS 2–3; הלקוח 2.7 ב־4 שבועות",
      campaignId: "c9",
      campaignName: "Sale",
      setBy: "carmen",
      setAt: "2026-10-26T08:00:00.000Z",
    },
  );
  assert.equal(market.last_sync_at, "2026-10-25", "keeps other settings");
  assert.deepEqual(market.pulse_targets.c9, {
    roas: 2.5,
    source: "carmen_market",
    rationale: "ענף אופנה בישראל ROAS 2–3; הלקוח 2.7 ב־4 שבועות",
    set_at: "2026-10-26T08:00:00.000Z",
    set_by: "carmen",
    goal: "ecommerce",
  });
  const approved = buildPulseTargetPatch(market, {
    goal: "ecommerce",
    kind: "cpa",
    value: 80,
    campaignId: "c9",
    campaignName: "Sale",
    setBy: "user-1",
    setAt: "2026-10-26T09:00:00.000Z",
  });
  assert.deepEqual(approved.pulse_targets.c9, {
    cpa: 80,
    source: "approved",
    set_at: "2026-10-26T09:00:00.000Z",
    set_by: "user-1",
    goal: "ecommerce",
  });
});

test("removing a platform target clears its fields; a wrong kind is refused", () => {
  const settings = {
    pulse_platform_targets: {
      leads: { cpl: 70, source: "approved" },
      ecommerce: { roas: 3 },
    },
  };
  const next = buildPulseTargetPatch(settings, { goal: "leads", value: null });
  assert.equal(next.pulse_platform_targets.leads, undefined);
  assert.equal(next.pulse_platform_targets.ecommerce.roas, 3);
  assert.throws(() =>
    buildPulseTargetPatch(settings, { goal: "leads", kind: "roas", value: 2 }),
  );
});

test("Carmen may not set a market target where an approved one applies", () => {
  const approvedPlatform = { pulse_platform_targets: { leads: { cpl: 70 } } };
  assert.equal(canSetMarketTarget(approvedPlatform, "leads", null).ok, false);
  assert.equal(
    canSetMarketTarget(approvedPlatform, "leads", { campaignId: "c1" }).reason,
    "approved_target_exists",
    "a campaign inherits the approved platform target",
  );
  assert.equal(canSetMarketTarget({ target_cpl: 50 }, "leads", null).ok, false);
  assert.equal(canSetMarketTarget({}, "leads", null).ok, true);
  const ownMarket = {
    pulse_platform_targets: { leads: { cpl: 70, source: "carmen_market" } },
  };
  assert.equal(
    canSetMarketTarget(ownMarket, "leads", null).ok,
    true,
    "Carmen may update her own estimate",
  );
  assert.equal(
    canSetMarketTarget({ pulse_targets: { c1: { cpl: 40 } } }, "leads", {
      campaignId: "c2",
    }).ok,
    true,
    "another campaign's approved target does not block",
  );
});

test("campaigns with spend and no target of any source are listed per platform", () => {
  const tables = [
    {
      id: "t1",
      client_id: "a",
      integration_settings: { pulse_targets: { c2: { cpl: 50 } } },
    },
    {
      id: "t2",
      client_id: "b",
      integration_settings: {
        pulse_platform_targets: {
          ecommerce: { roas: 3, source: "carmen_market" },
        },
      },
    },
  ];
  const row = (over) => ({
    campaign_key: over.campaign_id,
    client_id: "a",
    table_id: "t1",
    platform: "meta",
    goal: "leads",
    spend_7d: 100,
    delivery_status: "active",
    ...over,
  });
  const groups = listCampaignsWithoutTarget({
    tables,
    campaignRows: [
      row({ campaign_id: "c1", campaign_name: "No target", spend_7d: 400 }),
      row({ campaign_id: "c2", campaign_name: "Approved" }),
      row({ campaign_id: "c3", campaign_name: "No spend", spend_7d: 0 }),
      row({
        campaign_id: "c4",
        campaign_name: "Paused",
        delivery_status: "paused",
      }),
      row({ campaign_id: "c5", campaign_name: "Video", goal: "engagement" }),
      row({
        campaign_id: "c6",
        campaign_name: "Market",
        client_id: "b",
        table_id: "t2",
        goal: "ecommerce",
      }),
    ],
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].client_id, "a");
  assert.deepEqual(
    groups[0].campaigns.map((c) => c.campaign_id),
    ["c1"],
  );
  assert.equal(groups[0].spend_7d, 400);
});

test("summarizePulseTargets lists set targets with source and the missing ones", () => {
  const summary = summarizePulseTargets({
    tables: [
      {
        id: "t1",
        client_id: "a",
        integration_type: "facebook_insights",
        integration_settings: {
          pulse_platform_targets: {
            leads: {
              cpl: 70,
              source: "carmen_market",
              rationale: "בנצ׳מרק",
              set_at: "2026-10-26T08:00:00Z",
            },
          },
          pulse_targets: { c2: { cpl: 50, goal: "leads" } },
        },
      },
    ],
    campaignRows: [],
  });
  const client = summary.clients[0];
  assert.equal(client.platform_targets[0].source, "carmen_market");
  assert.equal(client.platform_targets[0].set_at, "2026-10-26T08:00:00Z");
  assert.equal(client.campaign_targets[0].campaign, "c2");
  assert.equal(client.campaign_targets[0].source, "approved");
  assert.equal(summary.missing_count, 0);
});
