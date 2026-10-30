import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { at } from "../test-fixtures.ts";
import { buildPulseTargetPatch } from "./patch.ts";
import { revertPulseTargetPatch } from "./revert.ts";

Deno.test(
  "revertPulseTargetPatch restores the target and keeps what a sync wrote since",
  () => {
    const before = {
      last_sync_at: "2026-10-25",
      pulse_platform_targets: { leads: { cpl: 90, source: "carmen_market" } },
    };
    const written = buildPulseTargetPatch(before, { goal: "leads", value: 70 });
    const synced = { ...written, last_sync_at: "2026-10-26" };
    assertEquals(revertPulseTargetPatch(synced, before, { goal: "leads" }), {
      ...before,
      last_sync_at: "2026-10-26",
    });
  },
);

Deno.test(
  "revertPulseTargetPatch keeps another goal's platform target saved since",
  () => {
    const before = {
      pulse_platform_targets: { leads: { cpl: 90, source: "carmen_market" } },
    };
    const written = buildPulseTargetPatch(before, { goal: "leads", value: 70 });
    const otherSave = buildPulseTargetPatch(written, {
      goal: "ecommerce",
      value: 3,
    });
    const reverted = revertPulseTargetPatch(otherSave, before, {
      goal: "leads",
    });
    assertEquals(at(reverted, "pulse_platform_targets", "leads"), {
      cpl: 90,
      source: "carmen_market",
    });
    assertStrictEquals(
      at(reverted, "pulse_platform_targets", "ecommerce", "roas"),
      3,
    );
  },
);

Deno.test(
  "revertPulseTargetPatch keeps another campaign's target saved since",
  () => {
    const before = {
      pulse_targets: { "Old name": { cpl: 40 }, c2: { cpl: 60 } },
    };
    const written = buildPulseTargetPatch(before, {
      goal: "leads",
      value: 55,
      campaignId: "c1",
      campaignName: "Old name",
    });
    const otherSave = buildPulseTargetPatch(written, {
      goal: "leads",
      value: 65,
      campaignId: "c2",
    });
    const reverted = revertPulseTargetPatch(otherSave, before, {
      goal: "leads",
      campaignId: "c1",
      campaignName: "Old name",
    });
    // c1's slot is gone and its name entry is back; c2 keeps the newer save.
    assertStrictEquals(at(reverted, "pulse_targets", "c1"), undefined);
    assertEquals(at(reverted, "pulse_targets", "Old name"), { cpl: 40 });
    assertStrictEquals(at(reverted, "pulse_targets", "c2", "cpl"), 65);
  },
);

Deno.test(
  "revertPulseTargetPatch removes a target map the save created",
  () => {
    // The first campaign write copies legacy campaign_targets into pulse_targets;
    // removing pulse_targets again lets the readers fall back to the legacy map.
    const legacy = { campaign_targets: { old: { cpl: 40 } } };
    const written = buildPulseTargetPatch(legacy, {
      goal: "leads",
      value: 55,
      campaignId: "c1",
    });
    assertEquals(
      revertPulseTargetPatch(written, legacy, {
        goal: "leads",
        campaignId: "c1",
      }),
      legacy,
    );
    const platform = buildPulseTargetPatch({}, { goal: "leads", value: 70 });
    assertEquals(revertPulseTargetPatch(platform, {}, { goal: "leads" }), {});
  },
);
