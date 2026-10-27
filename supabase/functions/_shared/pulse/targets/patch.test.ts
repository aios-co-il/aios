import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";

import { at } from "../test-fixtures.ts";
import { buildPulseTargetPatch } from "./patch.ts";
import { resolvePulseTarget } from "./resolve.ts";

Deno.test(
  "legacy campaign_targets is read and carried over on the first write",
  () => {
    const legacy = { campaign_targets: { old: { cpl: 40 } } };
    assertStrictEquals(
      resolvePulseTarget(legacy, "leads", { campaignId: "old" })?.value,
      40,
    );
    const next = buildPulseTargetPatch(legacy, {
      goal: "leads",
      value: 55,
      campaignId: "new",
    });
    assertStrictEquals(at(next, "pulse_targets", "old", "cpl"), 40);
    assertStrictEquals(at(next, "pulse_targets", "new", "cpl"), 55);
  },
);

Deno.test(
  "an approved save replaces Carmen's market target and drops its rationale",
  () => {
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
    assertStrictEquals(
      market.last_sync_at,
      "2026-10-25",
      "keeps other settings",
    );
    assertEquals(at(market, "pulse_targets", "c9"), {
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
    assertEquals(at(approved, "pulse_targets", "c9"), {
      cpa: 80,
      source: "approved",
      set_at: "2026-10-26T09:00:00.000Z",
      set_by: "user-1",
      goal: "ecommerce",
    });
  },
);

Deno.test(
  "removing a platform target clears its fields; a wrong kind is refused",
  () => {
    const settings = {
      pulse_platform_targets: {
        leads: { cpl: 70, source: "approved" },
        ecommerce: { roas: 3 },
      },
    };
    const next = buildPulseTargetPatch(settings, {
      goal: "leads",
      value: null,
    });
    assertStrictEquals(at(next, "pulse_platform_targets", "leads"), undefined);
    assertStrictEquals(
      at(next, "pulse_platform_targets", "ecommerce", "roas"),
      3,
    );
    assertThrows(() =>
      buildPulseTargetPatch(settings, {
        goal: "leads",
        kind: "roas",
        value: 2,
      }),
    );
  },
);

Deno.test(
  "a campaign save under the id clears a stale entry under the name",
  () => {
    const next = buildPulseTargetPatch(
      { pulse_targets: { Sale: { cpl: 90 }, other: { cpl: 40 } } },
      {
        goal: "leads",
        value: 70,
        campaignId: "c1",
        campaignName: "Sale",
        setAt: "2026-10-26T08:00:00.000Z",
      },
    );
    assertEquals(Object.keys(next.pulse_targets ?? {}).sort(), ["c1", "other"]);
    assertThrows(() =>
      buildPulseTargetPatch(
        {},
        { goal: "leads", value: 1, campaignId: "default" },
      ),
    );
    assertThrows(() =>
      buildPulseTargetPatch({}, { goal: "unknown", value: 1 }),
    );
  },
);
