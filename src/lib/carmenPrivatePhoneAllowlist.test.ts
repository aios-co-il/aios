import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePrivatePhoneRows,
  mergePrivatePhoneAllowlist,
} from "./carmenPrivatePhoneAllowlist.ts";

test("mergePrivatePhoneAllowlist: combines automation, identity, and policy", () => {
  const out = mergePrivatePhoneAllowlist({
    automationPhones: ["972501111111"],
    identities: [
      {
        phone: "972502222222",
        display_name: "אנה",
        status: "approved",
        surfaces: ["whatsapp_private"],
        relationship_note: "דבר קצר",
      },
    ],
    policyPhones: [
      { phone: "972503333333", label: "דוד", surfaces: ["whatsapp_private"] },
    ],
  });
  assert.equal(out.length, 3);
  assert.ok(
    out.some((r) => r.phone === "972501111111" && r.source === "automation"),
  );
  assert.ok(
    out.some(
      (r) =>
        r.phone === "972502222222" &&
        r.label === "אנה" &&
        r.relationship_note === "דבר קצר",
    ),
  );
  assert.ok(out.some((r) => r.phone === "972503333333" && r.label === "דוד"));
});

test("mergePrivatePhoneAllowlist: policy wins over automation for same phone", () => {
  const out = mergePrivatePhoneAllowlist({
    automationPhones: ["972501111111"],
    policyPhones: [
      {
        phone: "972501111111",
        label: "דוד מדיניות",
        surfaces: ["whatsapp_private"],
      },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "דוד מדיניות");
  assert.equal(out[0].source, "policy");
});

test("mergePrivatePhoneAllowlist: skips identities without private surface", () => {
  const out = mergePrivatePhoneAllowlist({
    identities: [
      {
        phone: "972502222222",
        display_name: "קבוצה בלבד",
        surfaces: ["whatsapp_group"],
      },
    ],
  });
  assert.equal(out.length, 0);
});

test("stored phone decoder preserves custom backend metadata and rejects malformed entries", () => {
  const rows = decodePrivatePhoneRows([
    null,
    4,
    { phone: 42 },
    {
      phone: "972501111111",
      source: "custom-source",
      dev_escalation_tier: "custom-tier",
      surfaces: ["whatsapp_private", 42],
      label: "Owner",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "custom-source");
  assert.equal(rows[0].dev_escalation_tier, "custom-tier");
  assert.deepEqual(rows[0].surfaces, ["whatsapp_private"]);
  assert.equal(mergePrivatePhoneAllowlist({ policyPhones: rows }).length, 1);
  assert.deepEqual(decodePrivatePhoneRows(null), []);
});

test("stored custom sources normalize to policy while preserving escalation metadata", () => {
  const stored = decodePrivatePhoneRows([
    {
      phone: "972501111111",
      source: "legacy",
      dev_escalation_tier: "custom-tier",
    },
  ]);
  const merged = mergePrivatePhoneAllowlist({ policyPhones: stored });
  assert.equal(stored[0].source, "legacy");
  assert.equal(merged[0].source, "policy");
  assert.equal(merged[0].dev_escalation_tier, "custom-tier");
});

test("bare policy row keeps the identity's escalation tier and note", () => {
  const merged = mergePrivatePhoneAllowlist({
    identities: [
      {
        phone: "972502222222",
        display_name: "אנה",
        surfaces: ["whatsapp_private"],
        dev_escalation_tier: "tier-1",
        relationship_note: "דבר קצר",
      },
    ],
    policyPhones: decodePrivatePhoneRows([{ phone: "972502222222" }]),
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "policy");
  assert.equal(merged[0].dev_escalation_tier, "tier-1");
  assert.equal(merged[0].relationship_note, "דבר קצר");
  assert.equal(merged[0].label, "אנה");
});

test("stored phone decoder emits only present keys", () => {
  const [row] = decodePrivatePhoneRows([{ phone: "972501111111" }]);
  assert.deepEqual(row, { phone: "972501111111" });
  const [cleared] = decodePrivatePhoneRows([
    { phone: "972501111111", dev_escalation_tier: null },
  ]);
  assert.deepEqual(cleared, {
    phone: "972501111111",
    dev_escalation_tier: null,
  });
});

test("stored phone decoder carries campaigner_id and client_id", () => {
  const [row] = decodePrivatePhoneRows([
    {
      phone: "972501111111",
      campaigner_id: "camp-1",
      client_id: "client-1",
    },
  ]);
  assert.equal(row.campaigner_id, "camp-1");
  assert.equal(row.client_id, "client-1");
  const [merged] = mergePrivatePhoneAllowlist({ policyPhones: [row] });
  assert.equal(merged.campaigner_id, "camp-1");
  assert.equal(merged.client_id, "client-1");
});
