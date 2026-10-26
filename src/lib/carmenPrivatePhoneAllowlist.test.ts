import { expect, test } from "vitest";
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
  expect(out.length).toBe(3);
  expect(
    out.some((r) => r.phone === "972501111111" && r.source === "automation"),
  ).toBeTruthy();
  expect(
    out.some(
      (r) =>
        r.phone === "972502222222" &&
        r.label === "אנה" &&
        r.relationship_note === "דבר קצר",
    ),
  ).toBeTruthy();
  expect(
    out.some((r) => r.phone === "972503333333" && r.label === "דוד"),
  ).toBeTruthy();
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
  expect(out.length).toBe(1);
  expect(out[0].label).toBe("דוד מדיניות");
  expect(out[0].source).toBe("policy");
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
  expect(out.length).toBe(0);
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
  expect(rows.length).toBe(1);
  expect(rows[0].source).toBe("custom-source");
  expect(rows[0].dev_escalation_tier).toBe("custom-tier");
  expect(rows[0].surfaces).toStrictEqual(["whatsapp_private"]);
  expect(mergePrivatePhoneAllowlist({ policyPhones: rows }).length).toBe(1);
  expect(decodePrivatePhoneRows(null)).toStrictEqual([]);
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
  expect(stored[0].source).toBe("legacy");
  expect(merged[0].source).toBe("policy");
  expect(merged[0].dev_escalation_tier).toBe("custom-tier");
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
  expect(merged.length).toBe(1);
  expect(merged[0].source).toBe("policy");
  expect(merged[0].dev_escalation_tier).toBe("tier-1");
  expect(merged[0].relationship_note).toBe("דבר קצר");
  expect(merged[0].label).toBe("אנה");
});

test("stored phone decoder emits only present keys", () => {
  const [row] = decodePrivatePhoneRows([{ phone: "972501111111" }]);
  expect(row).toStrictEqual({ phone: "972501111111" });
  const [cleared] = decodePrivatePhoneRows([
    { phone: "972501111111", dev_escalation_tier: null },
  ]);
  expect(cleared).toStrictEqual({
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
  expect(row.campaigner_id).toBe("camp-1");
  expect(row.client_id).toBe("client-1");
  const [merged] = mergePrivatePhoneAllowlist({ policyPhones: [row] });
  expect(merged.campaigner_id).toBe("camp-1");
  expect(merged.client_id).toBe("client-1");
});
