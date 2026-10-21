import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCarmenScopeConfig,
  resolveEffectiveScopeMode,
  parsePolicyPhones,
  policyPhoneList,
  resolveDevEscalationTier,
  identityAllowsSurface,
  findGreenApiMirrorOnlyGroupIds,
  SURFACE_GROUP,
  SURFACE_PRIVATE,
} from "./carmen-access-policy.mjs";

test("mergeCarmenScopeConfig: policy phones override automation", () => {
  const merged = mergeCarmenScopeConfig(
    { carmen_scope_mode: "all", carmen_allowed_phones: ["111"] },
    {
      private_phones: [
        { phone: "972507677613", surfaces: ["whatsapp_private"] },
      ],
      require_direct_address: true,
    },
    [],
  );
  assert.equal(merged.scopeMode, "specific_phone");
  assert.deepEqual(merged.allowedPhones, ["972507677613"]);
  assert.equal(merged.hasPolicy, true);
});

test("mergeCarmenScopeConfig: policy groups use resolved chat ids", () => {
  const merged = mergeCarmenScopeConfig(
    {},
    { allowed_group_ids: ["uuid-1"], open_member_groups: false },
    ["120363@g.us"],
  );
  assert.equal(merged.scopeMode, "specific_group");
  assert.deepEqual(merged.allowedGroups, ["120363@g.us"]);
});

test("identityAllowsSurface respects surfaces array", () => {
  assert.equal(
    identityAllowsSurface({ surfaces: [SURFACE_PRIVATE] }, SURFACE_GROUP),
    false,
  );
  assert.equal(
    identityAllowsSurface(
      { surfaces: [SURFACE_PRIVATE, SURFACE_GROUP] },
      SURFACE_GROUP,
    ),
    true,
  );
});

test("resolveDevEscalationTier prefers DB tier over hardcode", () => {
  assert.equal(resolveDevEscalationTier({}, "bugfix"), "bugfix");
});

test("parsePolicyPhones normalizes entries", () => {
  const rows = parsePolicyPhones([
    { phone: "0507677613", dev_escalation_tier: "full" },
  ]);
  assert.equal(rows[0].phone, "0507677613");
  assert.equal(policyPhoneList(rows)[0], "0507677613");
});

test("findGreenApiMirrorOnlyGroupIds excludes operator-only mirror groups", () => {
  const greenUser = "green-user-id";
  const manusLinked = new Set(["g-manus"]);
  const mirrorOnly = findGreenApiMirrorOnlyGroupIds(
    ["g-manus", "g-mirror", "g-empty", "g-mixed"],
    [
      {
        group_id: "g-mirror",
        provider: "green_api",
        connection_user_id: greenUser,
      },
      {
        group_id: "g-mixed",
        provider: "green_api",
        connection_user_id: greenUser,
      },
      {
        group_id: "g-mixed",
        provider: "manus_wa",
        connection_user_id: "manus-user",
      },
    ],
    new Set([greenUser]),
    manusLinked,
  );
  assert.deepEqual([...mirrorOnly], ["g-mirror"]);
});

test("resolveEffectiveScopeMode: policy phones do not block automation groups", () => {
  const merged = mergeCarmenScopeConfig(
    {
      carmen_scope_mode: "specific_group",
      carmen_allowed_group_ids: ["120363406768318497@g.us"],
    },
    { private_phones: [{ phone: "972507677613" }], allowed_group_ids: [] },
    [],
  );
  assert.equal(
    resolveEffectiveScopeMode(merged, "specific_group", true),
    "specific_group",
  );
  assert.equal(
    resolveEffectiveScopeMode(merged, "specific_group", false),
    "specific_phone",
  );
});

test("resolveEffectiveScopeMode: groups stay default-deny without opt-in", () => {
  const merged = mergeCarmenScopeConfig(
    { carmen_scope_mode: "all" },
    { private_phones: [{ phone: "972507677613" }] },
    [],
  );
  assert.equal(resolveEffectiveScopeMode(merged, "all", true), "all");
  assert.equal(
    resolveEffectiveScopeMode(merged, "specific_phone", true),
    "specific_phone",
  );
});

test("resolveEffectiveScopeMode: policy groups win in groups", () => {
  const merged = mergeCarmenScopeConfig(
    { carmen_scope_mode: "all" },
    {
      private_phones: [{ phone: "972507677613" }],
      allowed_group_ids: ["g1"],
    },
    ["120363406768318497@g.us"],
  );
  assert.equal(
    resolveEffectiveScopeMode(merged, "all", true),
    "specific_group",
  );
  assert.equal(
    resolveEffectiveScopeMode(merged, "all", false),
    "specific_phone",
  );
  assert.equal(resolveEffectiveScopeMode(null, undefined, false), "all");
});
