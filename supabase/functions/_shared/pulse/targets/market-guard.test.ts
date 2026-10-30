import { assertStrictEquals } from "jsr:@std/assert@1";

import { canSetMarketTarget } from "./market-guard.ts";
import { resolvePulseTarget } from "./resolve.ts";

Deno.test(
  "an approved platform target set after Carmen's campaign estimate wins and blocks her",
  () => {
    const settings = {
      pulse_targets: {
        c1: { cpl: 120, source: "carmen_market", rationale: "בנצ׳מרק 100–140" },
      },
      pulse_platform_targets: { leads: { cpl: 60, source: "approved" } },
    };
    const target = resolvePulseTarget(settings, "leads", { campaignId: "c1" });
    assertStrictEquals(target?.value, 60);
    assertStrictEquals(target?.source, "approved");
    assertStrictEquals(target?.scope, "platform");
    const check = canSetMarketTarget(settings, "leads", { campaignId: "c1" });
    assertStrictEquals(check.ok, false);
    assertStrictEquals(check.reason, "approved_target_exists");
  },
);

Deno.test(
  "Carmen never replaces an approved campaign slot, whatever its goal or key",
  () => {
    // (a) The slot holds an approved ecommerce CPA; a leads market write would
    // replace the slot whole and drop it.
    const otherGoal = {
      pulse_targets: {
        123: { cpa: 50, source: "approved", goal: "ecommerce" },
      },
    };
    const wrongGoal = canSetMarketTarget(otherGoal, "leads", {
      campaignId: "123",
    });
    assertStrictEquals(wrongGoal.ok, false);
    assertStrictEquals(wrongGoal.reason, "approved_target_exists");
    assertStrictEquals(wrongGoal.existing?.kind, "cpa");

    // (b) The approved target is stored under the name: a write under the id
    // would shadow it, because readers try the id first.
    const byName = { pulse_targets: { "Camp A": { cpl: 80 } } };
    assertStrictEquals(
      canSetMarketTarget(byName, "leads", {
        campaignId: "777",
        campaignName: "Camp A",
      }).reason,
      "approved_target_exists",
    );
    // And even if a market entry sits under the id, the approved one applies.
    const both = {
      pulse_targets: {
        777: { cpl: 40, source: "carmen_market" },
        "Camp A": { cpl: 80 },
      },
    };
    const resolved = resolvePulseTarget(both, "leads", {
      campaignId: "777",
      campaignName: "Camp A",
    });
    assertStrictEquals(resolved?.value, 80);
    assertStrictEquals(resolved?.source, "approved");
  },
);

Deno.test(
  "Carmen may not set a market target where an approved one applies",
  () => {
    const approvedPlatform = { pulse_platform_targets: { leads: { cpl: 70 } } };
    assertStrictEquals(
      canSetMarketTarget(approvedPlatform, "leads", null).ok,
      false,
    );
    assertStrictEquals(
      canSetMarketTarget(approvedPlatform, "leads", { campaignId: "c1" })
        .reason,
      "approved_target_exists",
      "a campaign inherits the approved platform target",
    );
    assertStrictEquals(
      canSetMarketTarget({ target_cpl: 50 }, "leads", null).ok,
      false,
    );
    assertStrictEquals(canSetMarketTarget({}, "leads", null).ok, true);
    const ownMarket = {
      pulse_platform_targets: { leads: { cpl: 70, source: "carmen_market" } },
    };
    assertStrictEquals(
      canSetMarketTarget(ownMarket, "leads", null).ok,
      true,
      "Carmen may update her own estimate",
    );
    assertStrictEquals(
      canSetMarketTarget({ pulse_targets: { c1: { cpl: 40 } } }, "leads", {
        campaignId: "c2",
      }).ok,
      true,
      "another campaign's approved target does not block",
    );
  },
);

Deno.test("a goal without target kinds is refused as unsupported", () => {
  const check = canSetMarketTarget({}, "unknown", null);
  assertStrictEquals(check.ok, false);
  assertStrictEquals(check.reason, "unsupported_goal");
});
