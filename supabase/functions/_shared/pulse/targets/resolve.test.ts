import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";

import { pulseTargetSourceLabel } from "./kinds.ts";
import {
  compareTargets,
  pulseTableTypeRank,
  resolvePulseTarget,
  resolvePulseTargetAcross,
  type PulseTargetPlace,
} from "./resolve.ts";

Deno.test(
  "a target without a source is approved; carmen_market is labelled",
  () => {
    const settings = {
      pulse_targets: {
        c1: {
          cpl: 60,
          source: "carmen_market",
          rationale: "ענף עורכי דין בישראל ₪60–90 לליד; ממוצע הלקוח ₪58",
        },
        c2: { cpl: 45 },
      },
    };
    assertStrictEquals(
      resolvePulseTarget(settings, "leads", { campaignId: "c2" })?.source,
      "approved",
    );
    const campaign = resolvePulseTarget(settings, "leads", {
      campaignId: "c1",
    });
    assertStrictEquals(campaign?.value, 60);
    assertStrictEquals(campaign?.source, "carmen_market");
    assertMatch(String(campaign?.rationale), /עורכי דין/);
    assertStrictEquals(
      pulseTargetSourceLabel(campaign?.source),
      "יעד שוק (כרמן)",
    );
    assertStrictEquals(pulseTargetSourceLabel(undefined), "יעד מאושר");
  },
);

Deno.test(
  "a campaign read from several tables gets one target whatever the table order",
  () => {
    const t1: PulseTargetPlace = {
      tableId: "t1",
      settings: { pulse_targets: { c1: { cpl: 60 } } },
      campaignId: "c1",
      campaignName: "Leads",
    };
    const t2: PulseTargetPlace = {
      tableId: "t2",
      settings: {
        pulse_platform_targets: { leads: { cpl: 90, source: "carmen_market" } },
      },
      campaignId: "c2",
      campaignName: "Leads",
    };
    for (const places of [
      [t1, t2],
      [t2, t1],
    ]) {
      const target = resolvePulseTargetAcross(places, "leads");
      assertStrictEquals(target?.value, 60);
      assertStrictEquals(target?.source, "approved");
      assertStrictEquals(target?.table_id, "t1");
    }

    // Same source and level on two tables: the most recently set one wins.
    const older = {
      tableId: "t1",
      settings: {
        pulse_targets: { c1: { cpl: 60, set_at: "2026-10-01T08:00:00Z" } },
      },
      campaignId: "c1",
    };
    const newer = {
      tableId: "t2",
      settings: {
        pulse_targets: { c2: { cpl: 70, set_at: "2026-10-20T08:00:00Z" } },
      },
      campaignId: "c2",
    };
    assertStrictEquals(
      resolvePulseTargetAcross([older, newer], "leads")?.value,
      70,
    );
    assertStrictEquals(
      resolvePulseTargetAcross([newer, older], "leads")?.value,
      70,
    );
    // A campaign's own target on one table beats a platform target on another.
    const platformOnly = {
      tableId: "t1",
      settings: { pulse_platform_targets: { leads: { cpl: 40 } } },
      campaignId: "c1",
    };
    assertStrictEquals(
      resolvePulseTargetAcross([platformOnly, newer], "leads")?.scope,
      "campaign",
    );
    assertStrictEquals(resolvePulseTargetAcross([], "leads"), null);
  },
);

Deno.test(
  "a full tie between tables resolves the same whatever order the caller passes",
  () => {
    // Same source, same level, no set_at: legacy target_cpl on duplicate tables.
    const tables = [
      { tableId: "t-b", settings: { target_cpl: 80 } },
      { tableId: "t-a", settings: { target_cpl: 60 } },
      { tableId: "t-c", settings: { target_cpl: 70 } },
    ];
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (const order of orders) {
      const target = resolvePulseTargetAcross(
        order.map((i) => tables[i]),
        "leads",
      );
      assertStrictEquals(target?.value, 60, order.join());
      assertStrictEquals(target?.table_id, "t-a", order.join());
      assertStrictEquals(target?.scope, "table");
    }

    // One table read under two identities, both with a campaign target of the same
    // date: the lower campaign id wins in either order.
    const settings = {
      pulse_targets: {
        c2: { cpl: 90, set_at: "2026-10-01T08:00:00Z" },
        c1: { cpl: 50, set_at: "2026-10-01T08:00:00Z" },
      },
    };
    const byC1 = { tableId: "t-a", settings, campaignId: "c1" };
    const byC2 = { tableId: "t-a", settings, campaignId: "c2" };
    for (const places of [
      [byC1, byC2],
      [byC2, byC1],
    ]) {
      const target = resolvePulseTargetAcross(places, "leads");
      assertStrictEquals(target?.value, 50);
      assertStrictEquals(target?.campaign_id, "c1");
    }
  },
);

Deno.test(
  "a full tie between duplicate Meta tables goes to the table built for the goal, in any order",
  () => {
    // Legacy target_roas on both tables. The lower table id is the insights table,
    // so only the type rank can pick the ecommerce one.
    const insights = {
      tableId: "t-a",
      integrationType: "facebook_insights",
      settings: { target_roas: 2, target_cpl: 60 },
    };
    const ecommerce = {
      tableId: "t-z",
      integrationType: "facebook_ecommerce",
      settings: { target_roas: 4, target_cpl: 80 },
    };
    for (const places of [
      [insights, ecommerce],
      [ecommerce, insights],
    ]) {
      const shop = resolvePulseTargetAcross(places, "ecommerce");
      assertStrictEquals(shop?.value, 4);
      assertStrictEquals(shop?.table_id, "t-z");
      const leads = resolvePulseTargetAcross(places, "leads");
      assertStrictEquals(leads?.value, 60);
      assertStrictEquals(leads?.table_id, "t-a");
    }
    assertStrictEquals(
      pulseTableTypeRank("facebook_ecommerce", "ecommerce"),
      0,
    );
    assertStrictEquals(pulseTableTypeRank("facebook_insights", "ecommerce"), 1);
    assertStrictEquals(pulseTableTypeRank("google_ads", "leads"), 0);
  },
);

Deno.test(
  "precedence: campaign → platform → pulse_targets.default → table fields",
  () => {
    const tableOnly = { target_cpl: 120 };
    const withDefault = {
      ...tableOnly,
      pulse_targets: { default: { cpl: 100 }, Leads: { cpl: 50 } },
    };
    const full = {
      ...withDefault,
      pulse_platform_targets: { leads: { cpl: 70 } },
    };
    assertStrictEquals(
      resolvePulseTarget(full, "leads", { campaignName: "Leads" })?.value,
      50,
    );
    assertStrictEquals(
      resolvePulseTarget(full, "leads", { campaignId: "x" })?.value,
      70,
    );
    assertStrictEquals(
      resolvePulseTarget(withDefault, "leads", null)?.value,
      100,
    );
    const table = resolvePulseTarget(tableOnly, "leads", null);
    assertStrictEquals(table?.value, 120);
    assertStrictEquals(table?.scope, "table");
    assertStrictEquals(table?.source, "approved");
  },
);

Deno.test(
  "a campaign's own CPA beats the platform ROAS (most specific place wins)",
  () => {
    const target = resolvePulseTarget(
      {
        pulse_platform_targets: { ecommerce: { roas: 3 } },
        pulse_targets: { shop: { cpa: 90 } },
      },
      "ecommerce",
      { campaignId: "shop" },
    );
    assertStrictEquals(target?.kind, "cpa");
    assertStrictEquals(target?.direction, "maximum");
  },
);

Deno.test("compareTargets puts approved first, then the narrower level", () => {
  const market = { source: "carmen_market", scope: "campaign" } as const;
  const approved = { source: "approved", scope: "table" } as const;
  assertStrictEquals(compareTargets(approved, market) < 0, true);
  assertStrictEquals(
    compareTargets(
      { source: "approved", scope: "campaign" },
      { source: "approved", scope: "platform" },
    ) < 0,
    true,
  );
  assertStrictEquals(compareTargets(market, market), 0);
});
